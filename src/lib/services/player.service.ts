import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { winPercentage } from "@/lib/engines/leaderboard";
import { GLOBAL_POINTS_PER_WIN } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId } from "@/lib/auth/tenancy";
import type { CreatePlayerSchema, UpdatePlayerSchema, UpdateOwnPlayerInput } from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreatePlayerSchema>;
type UpdateInput = z.infer<typeof UpdatePlayerSchema>;

export async function listPlayers(
  actor: AuthUser,
  p: Pagination,
  opts: { scope?: "mine" | "all" } = {}
) {
  const where = {
    deletedAt: null,
    // "all" = global player directory (view-only); default = your workspace.
    ...(opts.scope === "all" ? {} : orgFilter(actor)),
    ...(p.search
      ? {
          OR: [
            { fullName: { contains: p.search, mode: "insensitive" as const } },
            { displayName: { contains: p.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.player.findMany({
      where,
      ...skipTake(p),
      orderBy: { fullName: "asc" },
      include: { ranking: true },
    }),
    prisma.player.count({ where }),
  ]);
  return { items, total };
}

/**
 * Player profiles are part of the global directory — any signed-in user can
 * VIEW any player + their stats/history (a competitive record). Editing stays
 * workspace-scoped (see updatePlayer). The `actor` is kept for signature
 * symmetry / future per-field privacy, but no org check is applied to viewing.
 */
export async function getPlayer(_actor: AuthUser, id: string) {
  const player = await prisma.player.findFirst({
    where: { id, deletedAt: null },
    include: { ranking: true },
  });
  if (!player) throw Errors.notFound("Player");
  return player;
}

export async function createPlayer(input: CreateInput, actor: AuthUser) {
  const player = await prisma.player.create({
    data: {
      fullName: input.fullName,
      displayName: input.displayName ?? input.fullName,
      phone: input.phone,
      photoUrl: input.photoUrl,
      gender: input.gender,
      skillLevel: input.skillLevel,
      dateOfBirth: input.dateOfBirth,
      city: input.city,
      organizationId: ownOrgId(actor),
    },
  });
  await audit({ actorUserId: actor.id, action: "player.created", entityType: "Player", entityId: player.id, newValue: player });
  return player;
}

export async function updatePlayer(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.player.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Player");
  assertOrgAccess(actor, existing.organizationId);
  const updated = await prisma.player.update({
    where: { id },
    data: {
      fullName: input.fullName ?? undefined,
      displayName: input.displayName ?? undefined,
      phone: input.phone ?? undefined,
      photoUrl: input.photoUrl ?? undefined,
      gender: input.gender ?? undefined,
      skillLevel: input.skillLevel ?? undefined,
      dateOfBirth: input.dateOfBirth ?? undefined,
      city: input.city ?? undefined,
    },
  });
  await audit({ actorUserId: actor.id, action: "player.updated", entityType: "Player", entityId: id, previousValue: existing, newValue: updated });
  return updated;
}

/**
 * Self-service edit of the CURRENT user's own linked player profile — no
 * PLAYER_MANAGE permission required (any signed-in user can set their own
 * display name, city, and self-declared skill level). `null` clears a field.
 */
export async function updateOwnPlayer(actor: AuthUser, input: UpdateOwnPlayerInput) {
  if (!actor.playerId) {
    throw Errors.validation("Your account isn't linked to a player profile.");
  }
  const updated = await prisma.player.update({
    where: { id: actor.playerId },
    data: {
      fullName: input.fullName ?? undefined,
      displayName: input.displayName ?? undefined,
      city: input.city === undefined ? undefined : input.city,
      skillLevel: input.skillLevel === undefined ? undefined : input.skillLevel,
    },
    include: { ranking: true },
  });
  // Keep the account name in sync with the player's full name (it's what shows
  // in the header + dashboard greeting).
  if (input.fullName) {
    await prisma.user.update({ where: { id: actor.id }, data: { name: input.fullName } });
  }
  await audit({ actorUserId: actor.id, action: "player.self_updated", entityType: "Player", entityId: actor.playerId, newValue: { fullName: updated.fullName, displayName: updated.displayName, city: updated.city, skillLevel: updated.skillLevel } });
  return updated;
}

/** Aggregate stats, derived from PlayerRanking (which is derived from matches). */
export async function getPlayerStatistics(actor: AuthUser, id: string) {
  const player = await getPlayer(actor, id);
  const r = player.ranking;
  return {
    playerId: id,
    displayName: player.displayName,
    matchesPlayed: r?.matchesPlayed ?? 0,
    wins: r?.wins ?? 0,
    losses: r?.losses ?? 0,
    winPercentage: r?.winPercentage ?? winPercentage(r?.wins ?? 0, r?.matchesPlayed ?? 0),
    // Headline points mirror the global leaderboard: a flat 10 per win.
    totalPoints: (r?.wins ?? 0) * GLOBAL_POINTS_PER_WIN,
    tournamentsPlayed: r?.tournamentsPlayed ?? 0,
    titles: r?.titles ?? 0,
    currentRank: r?.rank ?? null,
    bestRank: r?.bestRank ?? null,
  };
}

/** Paginated match history for a player (singles + doubles via team). */
export async function getPlayerMatches(actor: AuthUser, id: string, p: Pagination) {
  await getPlayer(actor, id);
  const teamIds = (await prisma.teamPlayer.findMany({ where: { playerId: id }, select: { teamId: true } })).map(
    (t) => t.teamId
  );
  const where = {
    match: { deletedAt: null, tournament: { deletedAt: null } },
    OR: [{ playerId: id }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
  };
  const [parts, total] = await Promise.all([
    prisma.matchParticipant.findMany({
      where,
      ...skipTake(p),
      orderBy: { match: { scheduledAt: "desc" } },
      include: {
        match: {
          include: {
            tournament: { select: { id: true, name: true } },
            stage: { select: { name: true, type: true } },
            games: { orderBy: { gameNumber: "asc" } },
            participants: {
              include: {
                player: { select: { id: true, displayName: true } },
                team: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.matchParticipant.count({ where }),
  ]);

  const items = parts.map((mp) => {
    const m = mp.match;
    const opponent = m.participants.find((o) => o.side !== mp.side);
    const label = (x?: typeof opponent) =>
      x?.team?.name ?? x?.player?.displayName ?? "TBD";
    return {
      matchId: m.id,
      date: m.scheduledAt,
      tournament: m.tournament,
      stage: m.stage,
      opponent: label(opponent),
      score: m.games.map((g) => (mp.side === "A" ? `${g.scoreA}-${g.scoreB}` : `${g.scoreB}-${g.scoreA}`)),
      result: m.status === "completed" ? (mp.isWinner ? "win" : "loss") : m.status,
      bestOf: m.bestOf,
    };
  });
  return { items, total };
}

/** Tournament history with per-tournament result summary. */
export async function getPlayerTournaments(actor: AuthUser, id: string) {
  await getPlayer(actor, id);
  const entries = await prisma.leaderboardEntry.findMany({
    where: { playerId: id },
    include: { tournament: { select: { id: true, name: true, status: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return entries.map((e) => ({
    tournament: e.tournament,
    stageReached: e.stageReached,
    matchesPlayed: e.matchesPlayed,
    wins: e.wins,
    losses: e.losses,
    points: e.points,
    position: e.position,
  }));
}

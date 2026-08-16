import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { winPercentage } from "@/lib/engines/leaderboard";
import { globalRankingPoints } from "@/lib/engines/points";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId, isPlatformAdmin } from "@/lib/auth/tenancy";
import { sendPlayerClaimInviteEmail } from "@/lib/email/notifications";
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
export async function getPlayer(actor: AuthUser, id: string) {
  const player = await prisma.player.findFirst({
    where: { id, deletedAt: null },
    include: { ranking: true },
  });
  if (!player) throw Errors.notFound("Player");
  // Phone is private contact info — expose it only to the player themselves or a
  // platform admin. Everyone else (the global directory) gets it nulled out.
  const canSeePhone = actor.playerId === id || isPlatformAdmin(actor);
  return { ...player, phone: canSeePhone ? player.phone : null };
}

/**
 * Create a NEW player, keyed by a required email. We never create a duplicate:
 *   - if an account already exists with that email → reject and tell them to log
 *     in / reset their password (they're already on Smash; add them via Invite);
 *   - if a managed player was already pre-created with that email → reject (it
 *     already exists — invite that player instead);
 *   - otherwise create a managed player, storing `invitedEmail`.
 */
export async function createPlayer(input: CreateInput, actor: AuthUser) {
  const email = input.email.trim().toLowerCase();

  // An existing account owns this email — don't silently link; point them to auth.
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    throw Errors.conflict("An account already exists with this email. Please log in or reset the password — or add them from “Invite players”.");
  }
  // A managed player was already created with this email — avoid a duplicate.
  const existing = await prisma.player.findFirst({
    where: { invitedEmail: email, deletedAt: null },
    select: { displayName: true },
  });
  if (existing) {
    throw Errors.conflict(`A player already exists for this email (${existing.displayName}). Add them from “Invite players”.`);
  }

  const player = await prisma.player.create({
    data: {
      fullName: input.fullName,
      displayName: input.displayName ?? input.fullName,
      phone: input.phone,
      invitedEmail: email,
      photoUrl: input.photoUrl,
      gender: input.gender,
      skillLevel: input.skillLevel,
      dateOfBirth: input.dateOfBirth,
      city: input.city,
      organizationId: ownOrgId(actor),
    },
  });
  await audit({ actorUserId: actor.id, action: "player.created", entityType: "Player", entityId: player.id, newValue: player });
  // Invite them to claim this profile by signing up with the same email.
  await sendPlayerClaimInviteEmail({ to: email, playerName: player.displayName, invitedByName: actor.name });
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
      phone: input.phone === undefined ? undefined : input.phone,
      skillLevel: input.skillLevel === undefined ? undefined : input.skillLevel,
      locationName: input.locationName === undefined ? undefined : input.locationName,
      locationLat: input.locationLat === undefined ? undefined : input.locationLat,
      locationLng: input.locationLng === undefined ? undefined : input.locationLng,
      discoverable: input.discoverable === undefined ? undefined : input.discoverable,
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
  const wins = r?.wins ?? 0;
  const losses = r?.losses ?? 0;
  const hasPlayed = (r?.matchesPlayed ?? 0) > 0;
  const myPoints = globalRankingPoints(wins, losses);
  // Global rank computed on-read (we no longer rewrite everyone's rank on each
  // score). Global points use International scoring (win 10 / loss 2), so rank =
  // 1 + how many players have more global points. Cheap at this app's scale.
  let currentRank: number | null = null;
  if (hasPlayed) {
    const all = await prisma.playerRanking.findMany({ select: { wins: true, losses: true } });
    currentRank = 1 + all.filter((x) => globalRankingPoints(x.wins, x.losses) > myPoints).length;
  }
  return {
    playerId: id,
    displayName: player.displayName,
    matchesPlayed: r?.matchesPlayed ?? 0,
    wins,
    losses,
    winPercentage: r?.winPercentage ?? winPercentage(wins, r?.matchesPlayed ?? 0),
    // Headline points mirror the global leaderboard: International win 10 / loss 2.
    totalPoints: myPoints,
    tournamentsPlayed: r?.tournamentsPlayed ?? 0,
    titles: r?.titles ?? 0,
    currentRank,
    bestRank: r?.bestRank ?? currentRank,
  };
}

/**
 * Lightweight "identity" signals for a player profile: recent form (last 5),
 * current win/loss streak, top head-to-head rivalries (singles), and derived
 * achievement badges. All computed from completed match history + ranking.
 */
export async function getPlayerInsights(actor: AuthUser, id: string) {
  const player = await getPlayer(actor, id);
  const r = player.ranking;

  const parts = await prisma.matchParticipant.findMany({
    where: {
      // Singles → this player; doubles → the per-match snapshot the player was in
      // (playerId is null on a doubles participant), so doubles results count too.
      OR: [{ playerId: id }, { snapshotPlayers: { some: { playerId: id } } }],
      match: { status: "completed", deletedAt: null, tournament: { deletedAt: null } },
    },
    orderBy: { match: { createdAt: "desc" } },
    include: {
      match: {
        select: {
          matchType: true,
          participants: {
            select: { isWinner: true, playerId: true, player: { select: { id: true, displayName: true } } },
          },
        },
      },
    },
  });

  // Recent form, newest first (W/L per completed match).
  const form = parts.map((p) => (p.isWinner ? "W" : "L")) as ("W" | "L")[];
  const last5 = form.slice(0, 5);
  // Current streak = leading run of the same result.
  let streak = { type: form[0] ?? null as "W" | "L" | null, count: 0 };
  for (const res of form) {
    if (res === form[0]) streak = { type: res, count: streak.count + 1 };
    else break;
  }

  // Head-to-head (singles only): tally wins/losses per opponent.
  const h2h = new Map<string, { name: string; wins: number; losses: number }>();
  for (const p of parts) {
    if (p.match.matchType !== "singles") continue;
    const opp = p.match.participants.find((pp) => pp.playerId && pp.playerId !== id);
    if (!opp?.playerId || !opp.player) continue;
    const rec = h2h.get(opp.playerId) ?? { name: opp.player.displayName, wins: 0, losses: 0 };
    if (p.isWinner) rec.wins += 1;
    else rec.losses += 1;
    h2h.set(opp.playerId, rec);
  }
  const headToHead = [...h2h.entries()]
    .map(([playerId, v]) => ({ playerId, ...v, played: v.wins + v.losses }))
    .sort((a, b) => b.played - a.played)
    .slice(0, 5);

  // Derived achievement badges (only earned ones are returned).
  const wins = r?.wins ?? 0;
  const played = r?.matchesPlayed ?? 0;
  const titles = r?.titles ?? 0;
  const best = r?.bestRank ?? null;
  const badges: { key: string; label: string; icon: string }[] = [];
  if (titles >= 1) badges.push({ key: "champion", label: `Champion ×${titles}`, icon: "🏆" });
  if (best != null && best <= 3) badges.push({ key: "podium", label: `Top-3 (best #${best})`, icon: "🥇" });
  if (streak.type === "W" && streak.count >= 3) badges.push({ key: "onfire", label: `${streak.count}-win streak`, icon: "🔥" });
  if (wins >= 100) badges.push({ key: "legend", label: "100 wins", icon: "👑" });
  else if (wins >= 50) badges.push({ key: "w50", label: "50 wins", icon: "⭐" });
  else if (wins >= 10) badges.push({ key: "w10", label: "10 wins", icon: "✨" });
  else if (wins >= 1) badges.push({ key: "w1", label: "First win", icon: "🎉" });
  if (played >= 100) badges.push({ key: "veteran", label: "100 matches", icon: "🎖️" });

  return { last5, streak, headToHead, badges };
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
    // Singles entries are keyed by playerId; doubles standings are keyed by TEAM,
    // so also match tournaments where the player is on the team — otherwise a
    // doubles player's tournament history comes back empty.
    where: { OR: [{ playerId: id }, { team: { teamPlayers: { some: { playerId: id } } } }] },
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

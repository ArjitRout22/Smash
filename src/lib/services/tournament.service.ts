import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { TOURNAMENT_TRANSITIONS, type TournamentStatus } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId, isPlatformAdmin } from "@/lib/auth/tenancy";
import type {
  CreateTournamentSchema,
  UpdateTournamentSchema,
} from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateTournamentSchema>;
type UpdateInput = z.infer<typeof UpdateTournamentSchema>;

export async function listTournaments(actor: AuthUser, p: Pagination, filters: { status?: string }) {
  const where = {
    deletedAt: null,
    ...orgFilter(actor),
    ...(filters.status ? { status: filters.status } : {}),
    ...(p.search ? { name: { contains: p.search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      ...skipTake(p),
      orderBy: { createdAt: p.sortDir },
      include: {
        organizer: { select: { id: true, name: true, phone: true } },
        _count: { select: { tournamentPlayers: true, teams: true, matches: true } },
      },
    }),
    prisma.tournament.count({ where }),
  ]);
  return { items, total };
}

export async function getTournament(actor: AuthUser, id: string) {
  const t = await prisma.tournament.findFirst({
    where: { id, deletedAt: null },
    include: {
      organizer: { select: { id: true, name: true, phone: true } },
      stages: { orderBy: { order: "asc" } },
      _count: { select: { tournamentPlayers: true, teams: true, matches: true, stages: true } },
    },
  });
  if (!t) throw Errors.notFound("Tournament");
  await assertCanView(actor, t);
  const canManage = isPlatformAdmin(actor) || t.organizationId === actor.organizationId;
  return { ...t, canManage };
}

/** True if the caller may VIEW this tournament (owner, public, or participant). */
async function assertCanView(
  actor: AuthUser,
  t: { organizationId: string | null; visibility: string; id: string }
): Promise<void> {
  if (isPlatformAdmin(actor)) return;
  if (t.organizationId === actor.organizationId) return;
  if (t.visibility === "public") return;
  // Private tournament in another workspace — only visible to its participants.
  if (actor.playerId) {
    const part = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_playerId: { tournamentId: t.id, playerId: actor.playerId } },
    });
    if (part && part.status === "registered") return;
  }
  throw Errors.forbidden("You don't have access to this tournament");
}

/** Load a tournament the caller may VIEW (for read-only sub-resources). */
export async function loadViewableTournament(actor: AuthUser, id: string) {
  const t = await prisma.tournament.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, organizationId: true, visibility: true, format: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  await assertCanView(actor, t);
  return t;
}

export async function createTournament(input: CreateInput, actor: AuthUser) {
  const t = await prisma.tournament.create({
    data: {
      name: input.name,
      description: input.description,
      location: input.location,
      startDate: input.startDate,
      endDate: input.endDate,
      format: input.format,
      visibility: input.visibility,
      organizerId: input.organizerId ?? actor.id,
      createdById: actor.id,
      organizationId: ownOrgId(actor),
      pointsConfig: input.pointsConfig ?? undefined,
      status: "draft",
    },
  });
  await audit({ actorUserId: actor.id, action: "tournament.created", entityType: "Tournament", entityId: t.id, newValue: t });
  return t;
}

export async function updateTournament(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, existing.organizationId);

  if (input.status && input.status !== existing.status) {
    const allowed = TOURNAMENT_TRANSITIONS[existing.status as TournamentStatus] ?? [];
    if (!allowed.includes(input.status)) {
      throw Errors.invalidState(
        `Cannot change tournament status from "${existing.status}" to "${input.status}"`
      );
    }
  }

  const updated = await prisma.tournament.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      description: input.description === undefined ? undefined : input.description,
      location: input.location === undefined ? undefined : input.location,
      startDate: input.startDate === undefined ? undefined : input.startDate,
      endDate: input.endDate === undefined ? undefined : input.endDate,
      format: input.format ?? undefined,
      status: input.status ?? undefined,
      visibility: input.visibility ?? undefined,
      organizerId: input.organizerId ?? undefined,
      pointsConfig: input.pointsConfig === undefined ? undefined : input.pointsConfig ?? undefined,
    },
  });
  await audit({
    actorUserId: actor.id,
    action: "tournament.updated",
    entityType: "Tournament",
    entityId: id,
    previousValue: existing,
    newValue: updated,
  });
  return updated;
}

export async function softDeleteTournament(id: string, actor: AuthUser) {
  const existing = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, existing.organizationId);
  await prisma.tournament.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: "tournament.deleted", entityType: "Tournament", entityId: id, previousValue: existing });
}

export async function listTournamentPlayers(actor: AuthUser, tournamentId: string) {
  await loadOwnedTournament(actor, tournamentId);
  return prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    include: { player: { include: { ranking: true } } },
    orderBy: { registeredAt: "asc" },
  });
}

export async function addTournamentPlayers(tournamentId: string, playerIds: string[], actor: AuthUser) {
  const tournament = await loadOwnedTournament(actor, tournamentId);
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds }, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (players.length !== playerIds.length) {
    throw Errors.validation("One or more players do not exist");
  }
  // Players must belong to the same workspace as the tournament.
  if (players.some((p) => p.organizationId !== tournament.organizationId)) {
    throw Errors.validation("All players must belong to this workspace");
  }
  const result = await prisma.$transaction(
    playerIds.map((playerId) =>
      prisma.tournamentPlayer.upsert({
        where: { tournamentId_playerId: { tournamentId, playerId } },
        update: { status: "registered" },
        create: { tournamentId, playerId },
      })
    )
  );
  await audit({ actorUserId: actor.id, action: "tournament.players.added", entityType: "Tournament", entityId: tournamentId, newValue: { playerIds } });
  return result;
}

export async function getTournamentLeaderboard(actor: AuthUser, tournamentId: string) {
  await loadViewableTournament(actor, tournamentId);
  const entries = await prisma.leaderboardEntry.findMany({
    where: { tournamentId },
    include: {
      player: { select: { id: true, displayName: true, fullName: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ rank: "asc" }, { points: "desc" }],
  });
  return entries.map((e) => ({
    rank: e.rank,
    position: e.position,
    stageReached: e.stageReached,
    matchesPlayed: e.matchesPlayed,
    wins: e.wins,
    losses: e.losses,
    points: e.points,
    entity: e.team
      ? { type: "team" as const, id: e.team.id, name: e.team.name }
      : e.player
        ? { type: "player" as const, id: e.player.id, name: e.player.displayName }
        : null,
  }));
}

// --- Public discovery + join requests (Phase 3) ----------------------------

/** Cross-workspace list of PUBLIC tournaments anyone can discover + join. */
export async function listPublicTournaments(p: Pagination, filters: { status?: string }) {
  const where = {
    deletedAt: null,
    visibility: "public",
    ...(filters.status ? { status: filters.status } : {}),
    ...(p.search ? { name: { contains: p.search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      ...skipTake(p),
      orderBy: { createdAt: p.sortDir },
      include: {
        organizer: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { tournamentPlayers: true, matches: true } },
      },
    }),
    prisma.tournament.count({ where }),
  ]);
  return { items, total };
}

/** A signed-in player requests to join a public tournament. */
export async function requestToJoin(actor: AuthUser, tournamentId: string) {
  if (!actor.playerId) {
    throw Errors.validation("You need a player profile to join tournaments");
  }
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, visibility: true, status: true, organizationId: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  if (t.organizationId === actor.organizationId) {
    throw Errors.validation("This tournament is already in your workspace");
  }
  if (t.visibility !== "public") throw Errors.forbidden("This tournament isn't open to join");
  if (t.status === "completed" || t.status === "cancelled") {
    throw Errors.invalidState("This tournament is no longer accepting players");
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId: actor.playerId } },
  });
  if (existing?.status === "registered") throw Errors.conflict("You're already in this tournament");
  if (existing?.status === "requested") throw Errors.conflict("Your request is already pending");

  const tp = await prisma.tournamentPlayer.upsert({
    where: { tournamentId_playerId: { tournamentId, playerId: actor.playerId } },
    update: { status: "requested" },
    create: { tournamentId, playerId: actor.playerId, status: "requested" },
  });
  await audit({ actorUserId: actor.id, action: "tournament.join.requested", entityType: "Tournament", entityId: tournamentId, newValue: { playerId: actor.playerId } });
  return tp;
}

/** Organizer: pending join requests for their tournament. */
export async function listJoinRequests(actor: AuthUser, tournamentId: string) {
  await loadOwnedTournament(actor, tournamentId);
  return prisma.tournamentPlayer.findMany({
    where: { tournamentId, status: "requested" },
    include: { player: { select: { id: true, displayName: true, fullName: true, city: true, ranking: true } } },
    orderBy: { registeredAt: "asc" },
  });
}

/** Organizer: accept or decline a join request. */
export async function respondToJoinRequest(
  actor: AuthUser,
  tournamentId: string,
  playerId: string,
  action: "accept" | "decline"
) {
  await loadOwnedTournament(actor, tournamentId);
  const tp = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  });
  if (!tp || tp.status !== "requested") throw Errors.notFound("Join request");
  const updated = await prisma.tournamentPlayer.update({
    where: { tournamentId_playerId: { tournamentId, playerId } },
    data: { status: action === "accept" ? "registered" : "declined" },
  });
  await audit({ actorUserId: actor.id, action: `tournament.join.${action}ed`, entityType: "Tournament", entityId: tournamentId, newValue: { playerId } });
  return updated;
}

/** Organizer: remove a participant (or a request) from their tournament. */
export async function removeParticipant(actor: AuthUser, tournamentId: string, playerId: string) {
  await loadOwnedTournament(actor, tournamentId);
  const inUse = await prisma.matchParticipant.count({
    where: { playerId, match: { tournamentId } },
  });
  if (inUse > 0) {
    // Keep them registered if they already have matches (removing would orphan results).
    throw Errors.conflict("This player already has matches — cannot remove them");
  }
  await prisma.tournamentPlayer.update({
    where: { tournamentId_playerId: { tournamentId, playerId } },
    data: { status: "removed" },
  });
  await audit({ actorUserId: actor.id, action: "tournament.participant.removed", entityType: "Tournament", entityId: tournamentId, newValue: { playerId } });
}

/** Load a tournament and assert the caller's workspace owns it. */
export async function loadOwnedTournament(actor: AuthUser, tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, organizationId: true, format: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, t.organizationId);
  return t;
}

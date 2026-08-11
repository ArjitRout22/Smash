import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { TOURNAMENT_TRANSITIONS, type TournamentStatus } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId } from "@/lib/auth/tenancy";
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
  assertOrgAccess(actor, t.organizationId);
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
  await loadOwnedTournament(actor, tournamentId);
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

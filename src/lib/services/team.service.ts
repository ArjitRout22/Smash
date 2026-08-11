import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";
import type { CreateTeamSchema, UpdateTeamSchema } from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateTeamSchema>;
type UpdateInput = z.infer<typeof UpdateTeamSchema>;

async function validatePlayers(playerIds: string[]) {
  const unique = new Set(playerIds);
  if (unique.size !== playerIds.length) {
    throw Errors.validation("A team cannot contain the same player twice");
  }
  const found = await prisma.player.findMany({
    where: { id: { in: playerIds }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== playerIds.length) {
    throw Errors.validation("One or more players do not exist");
  }
}

export async function listTeams(filters: { tournamentId?: string }) {
  return prisma.team.findMany({
    where: { deletedAt: null, ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}) },
    include: {
      teamPlayers: { include: { player: { select: { id: true, displayName: true } } } },
      tournament: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTeam(id: string) {
  const team = await prisma.team.findFirst({
    where: { id, deletedAt: null },
    include: { teamPlayers: { include: { player: true } }, tournament: { select: { id: true, name: true } } },
  });
  if (!team) throw Errors.notFound("Team");
  return team;
}

export async function createTeam(input: CreateInput, actor: AuthUser) {
  await validatePlayers(input.playerIds);
  const team = await prisma.team.create({
    data: {
      name: input.name,
      teamType: input.teamType,
      tournamentId: input.tournamentId,
      organizationId: actor.organizationId,
      teamPlayers: {
        create: input.playerIds.map((playerId, i) => ({ playerId, position: i + 1 })),
      },
    },
    include: { teamPlayers: true },
  });
  await audit({ actorUserId: actor.id, action: "team.created", entityType: "Team", entityId: team.id, newValue: team });
  return team;
}

export async function updateTeam(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.team.findFirst({ where: { id, deletedAt: null }, include: { teamPlayers: true } });
  if (!existing) throw Errors.notFound("Team");
  if (input.playerIds) await validatePlayers(input.playerIds);

  const updated = await prisma.$transaction(async (tx) => {
    if (input.playerIds) {
      await tx.teamPlayer.deleteMany({ where: { teamId: id } });
      await tx.teamPlayer.createMany({
        data: input.playerIds.map((playerId, i) => ({ teamId: id, playerId, position: i + 1 })),
      });
    }
    return tx.team.update({
      where: { id },
      data: { name: input.name ?? undefined, teamType: input.teamType ?? undefined },
      include: { teamPlayers: { include: { player: { select: { id: true, displayName: true } } } } },
    });
  });
  await audit({ actorUserId: actor.id, action: "team.updated", entityType: "Team", entityId: id, previousValue: existing, newValue: updated });
  return updated;
}

export async function deleteTeam(id: string, actor: AuthUser) {
  const existing = await prisma.team.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Team");
  const inUse = await prisma.matchParticipant.count({ where: { teamId: id } });
  if (inUse > 0) {
    throw Errors.conflict("Cannot delete a team that is already assigned to matches");
  }
  await prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: "team.deleted", entityType: "Team", entityId: id, previousValue: existing });
}

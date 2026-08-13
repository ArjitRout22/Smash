import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId, isPlatformAdmin } from "@/lib/auth/tenancy";
import type { CreateTeamSchema, UpdateTeamSchema } from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateTeamSchema>;
type UpdateInput = z.infer<typeof UpdateTeamSchema>;

type MemberStatus = "active" | "invited";

/**
 * Decide each player's membership status for a team, or throw:
 *  - tournament team: players must be REGISTERED in the tournament (all active).
 *  - standalone team: your own workspace's players join as `active`; players from
 *    OTHER workspaces must have a login account and are `invited` (they accept to
 *    join). This replaces the old "must belong to your workspace" hard block.
 * Returns playerId -> status.
 */
async function classifyTeamPlayers(
  playerIds: string[],
  actor: AuthUser,
  tournamentId?: string | null
): Promise<Map<string, MemberStatus>> {
  const unique = new Set(playerIds);
  if (unique.size !== playerIds.length) {
    throw Errors.validation("A team cannot contain the same player twice");
  }
  const found = await prisma.player.findMany({
    where: { id: { in: playerIds }, deletedAt: null },
    include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
  });
  if (found.length !== playerIds.length) {
    throw Errors.validation("One or more players do not exist");
  }

  const status = new Map<string, MemberStatus>();

  if (tournamentId) {
    const registered = await prisma.tournamentPlayer.findMany({
      where: { tournamentId, playerId: { in: playerIds }, status: "registered" },
      select: { playerId: true },
    });
    const regSet = new Set(registered.map((r) => r.playerId));
    for (const p of found) {
      if (!regSet.has(p.id)) throw Errors.validation("All players must be registered in this tournament");
      status.set(p.id, "active");
    }
    return status;
  }

  // Standalone team.
  const admin = isPlatformAdmin(actor);
  for (const p of found) {
    if (admin || p.organizationId === actor.organizationId) {
      status.set(p.id, "active"); // your own workspace's player — no invite needed
    } else if (p.user && p.user.isActive && !p.user.deletedAt) {
      status.set(p.id, "invited"); // another workspace's player with an account → invite
    } else {
      throw Errors.validation(
        `${p.displayName} is in another workspace and has no account, so they can't be invited to a team.`
      );
    }
  }
  return status;
}

const teamInclude = {
  teamPlayers: {
    include: { player: { select: { id: true, displayName: true } } },
    orderBy: { position: "asc" as const },
  },
  tournament: { select: { id: true, name: true } },
} as const;

export async function listTeams(actor: AuthUser, filters: { tournamentId?: string }) {
  return prisma.team.findMany({
    where: { deletedAt: null, ...orgFilter(actor), ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}) },
    include: teamInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTeam(actor: AuthUser, id: string) {
  const team = await prisma.team.findFirst({
    where: { id, deletedAt: null },
    include: { teamPlayers: { include: { player: true } }, tournament: { select: { id: true, name: true } } },
  });
  if (!team) throw Errors.notFound("Team");
  assertOrgAccess(actor, team.organizationId);
  return team;
}

export async function createTeam(input: CreateInput, actor: AuthUser) {
  if (input.tournamentId) {
    const t = await prisma.tournament.findFirst({ where: { id: input.tournamentId, deletedAt: null }, select: { organizationId: true } });
    if (!t) throw Errors.validation("Tournament not found");
    assertOrgAccess(actor, t.organizationId);
  }
  const status = await classifyTeamPlayers(input.playerIds, actor, input.tournamentId);
  const team = await prisma.team.create({
    data: {
      name: input.name,
      teamType: input.teamType,
      tournamentId: input.tournamentId,
      organizationId: ownOrgId(actor),
      teamPlayers: {
        create: input.playerIds.map((playerId, i) => ({ playerId, position: i + 1, status: status.get(playerId)! })),
      },
    },
    include: teamInclude,
  });
  await audit({ actorUserId: actor.id, action: "team.created", entityType: "Team", entityId: team.id, newValue: { name: team.name } });
  return team;
}

/**
 * Randomly pair a tournament's UNASSIGNED registered players into DOUBLES teams
 * (2 per team). Players already on a team are left untouched, and any odd
 * leftover player is returned as `unassigned` (no half-teams). Additive only —
 * never modifies existing teams or matches. Auto-names new teams "Team N",
 * continuing after the current team count.
 */
export async function createRandomTeams(actor: AuthUser, tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { organizationId: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, t.organizationId);

  const [registered, assigned, existingCount] = await Promise.all([
    prisma.tournamentPlayer.findMany({
      where: { tournamentId, status: "registered" },
      select: { player: { select: { id: true, displayName: true } } },
    }),
    prisma.teamPlayer.findMany({
      where: { team: { tournamentId, deletedAt: null } },
      select: { playerId: true },
    }),
    prisma.team.count({ where: { tournamentId, deletedAt: null } }),
  ]);

  const assignedIds = new Set(assigned.map((a) => a.playerId));
  const eligible = registered.map((r) => r.player).filter((p) => !assignedIds.has(p.id));

  // Fisher–Yates shuffle.
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const pairs: { id: string; displayName: string }[][] = [];
  for (let i = 0; i + 1 < eligible.length; i += 2) pairs.push([eligible[i], eligible[i + 1]]);
  const unassigned = eligible.length % 2 === 1 ? [eligible[eligible.length - 1]] : [];

  if (pairs.length === 0) {
    throw Errors.validation(
      eligible.length === 0
        ? "Every registered player is already on a team."
        : "Need at least 2 unassigned players to form a doubles team."
    );
  }

  // Create all teams atomically so a partial failure never leaves half a draw.
  const teams = await prisma.$transaction(
    pairs.map((pair, i) =>
      prisma.team.create({
        data: {
          name: `Team ${existingCount + i + 1}`,
          teamType: "doubles",
          tournamentId,
          organizationId: ownOrgId(actor),
          teamPlayers: {
            create: pair.map((p, pos) => ({ playerId: p.id, position: pos + 1, status: "active" as const })),
          },
        },
        include: teamInclude,
      })
    )
  );

  await audit({
    actorUserId: actor.id,
    action: "team.random_generated",
    entityType: "Tournament",
    entityId: tournamentId,
    newValue: { created: teams.length, unassigned: unassigned.map((u) => u.id) },
  });
  return { created: teams.length, teams, unassigned };
}

export async function updateTeam(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.team.findFirst({ where: { id, deletedAt: null }, include: { teamPlayers: true } });
  if (!existing) throw Errors.notFound("Team");
  assertOrgAccess(actor, existing.organizationId);
  const status = input.playerIds ? await classifyTeamPlayers(input.playerIds, actor, existing.tournamentId) : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.playerIds && status) {
      await tx.teamPlayer.deleteMany({ where: { teamId: id } });
      await tx.teamPlayer.createMany({
        data: input.playerIds.map((playerId, i) => ({ teamId: id, playerId, position: i + 1, status: status.get(playerId)! })),
      });
    }
    return tx.team.update({
      where: { id },
      data: { name: input.name ?? undefined, teamType: input.teamType ?? undefined },
      include: teamInclude,
    });
  });
  await audit({ actorUserId: actor.id, action: "team.updated", entityType: "Team", entityId: id, previousValue: { name: existing.name }, newValue: { name: updated.name } });
  return updated;
}

export async function deleteTeam(id: string, actor: AuthUser) {
  const existing = await prisma.team.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Team");
  assertOrgAccess(actor, existing.organizationId);
  const inUse = await prisma.matchParticipant.count({ where: { teamId: id } });
  if (inUse > 0) {
    throw Errors.conflict("Cannot delete a team that is already assigned to matches");
  }
  await prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: "team.deleted", entityType: "Team", entityId: id, previousValue: existing });
}

// --- Team invites (a cross-workspace player joining a standalone team) --------

/** The current user's pending team invitations. */
export async function listMyTeamInvites(actor: AuthUser) {
  if (!actor.playerId) return [];
  const rows = await prisma.teamPlayer.findMany({
    where: { playerId: actor.playerId, status: "invited", team: { deletedAt: null } },
    include: {
      team: {
        include: {
          teamPlayers: { include: { player: { select: { id: true, displayName: true } } } },
          organization: { select: { name: true } },
        },
      },
    },
    orderBy: { id: "desc" },
  });
  return rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.team.name,
    teamType: r.team.teamType,
    workspace: r.team.organization?.name ?? null,
    members: r.team.teamPlayers.map((tp) => tp.player.displayName),
  }));
}

/** Accept or decline a team invitation. */
export async function respondToTeamInvite(actor: AuthUser, teamId: string, action: "accept" | "decline") {
  if (!actor.playerId) throw Errors.validation("Your account isn't linked to a player profile.");
  const tp = await prisma.teamPlayer.findFirst({ where: { teamId, playerId: actor.playerId, status: "invited" } });
  if (!tp) throw Errors.notFound("Team invitation");
  if (action === "accept") {
    await prisma.teamPlayer.update({ where: { id: tp.id }, data: { status: "active" } });
  } else {
    await prisma.teamPlayer.delete({ where: { id: tp.id } });
  }
  await audit({ actorUserId: actor.id, action: `team.invite.${action}ed`, entityType: "Team", entityId: teamId });
  return { status: action === "accept" ? "active" : "declined" };
}

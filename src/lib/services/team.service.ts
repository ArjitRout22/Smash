import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, assertOrgAccess, ownOrgId, isPlatformAdmin } from "@/lib/auth/tenancy";
import { attachMatchSnapshots } from "@/lib/services/match.service";
import type { CreateTeamSchema, UpdateTeamSchema, ChangeTeamPairInput } from "@/lib/validation/schemas";

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
  // Renaming a team is restricted to platform admins; everyone else is told to
  // contact support (the UI shows the same message before it even calls this).
  if (input.name !== undefined && input.name !== existing.name && !isPlatformAdmin(actor)) {
    throw Errors.forbidden("Only an admin can rename a team. Please contact support@smashhero.app to request a change.");
  }
  const status = input.playerIds ? await classifyTeamPlayers(input.playerIds, actor, existing.tournamentId) : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.playerIds && status) {
      await tx.teamPlayer.deleteMany({ where: { teamId: id } });
      await tx.teamPlayer.createMany({
        data: input.playerIds.map((playerId, i) => ({ teamId: id, playerId, position: i + 1, status: status.get(playerId)! })),
      });
    }
    const team = await tx.team.update({
      where: { id },
      data: { name: input.name ?? undefined, teamType: input.teamType ?? undefined },
      include: teamInclude,
    });
    // A rename only reaches STILL-SCHEDULED fixtures: their per-match team-name
    // snapshot is refreshed, while in-progress/completed matches keep the name
    // the team had when they were played (immutable history, like pair snapshots).
    if (input.name && input.name !== existing.name) {
      await tx.matchParticipant.updateMany({
        where: { teamId: id, match: { status: "scheduled", deletedAt: null } },
        data: { teamName: input.name },
      });
    }
    return team;
  });
  await audit({ actorUserId: actor.id, action: "team.updated", entityType: "Team", entityId: id, previousValue: { name: existing.name }, newValue: { name: updated.name } });
  return updated;
}

/**
 * Swap ONE player on a team for another, keeping the team's identity (id, name,
 * fixtures) unchanged. Core rule: team identity is stable, membership can change,
 * and a match's player snapshot never changes once the match has started.
 *  - Case A (all fixtures scheduled): future fixtures pick up the new pairing.
 *  - Case B (some matches completed): completed snapshots stay frozen.
 *  - Case C (a match is live): blocked until it finishes.
 */
export async function changeTeamPair(actor: AuthUser, teamId: string, input: ChangeTeamPairInput) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, deletedAt: null },
    include: {
      teamPlayers: { include: { player: { select: { id: true, displayName: true } } } },
      tournament: { select: { id: true, organizationId: true, status: true } },
    },
  });
  if (!team) throw Errors.notFound("Team");
  assertOrgAccess(actor, team.organizationId);

  // Edge: a finished tournament is read-only.
  if (team.tournament && (team.tournament.status === "completed" || team.tournament.status === "cancelled")) {
    throw Errors.invalidState("This tournament is finished — team pairings can no longer be changed.");
  }

  // Case C — a live match involving this team blocks the change.
  const live = await prisma.matchParticipant.count({
    where: { teamId, match: { status: "in_progress", deletedAt: null } },
  });
  if (live > 0) {
    throw Errors.conflict(`${team.name} currently has an active match. The team pairing can be changed after the match is completed.`);
  }

  const members = team.teamPlayers.filter((tp) => tp.status === "active");
  const outMember = members.find((m) => m.playerId === input.outPlayerId);
  if (!outMember) throw Errors.validation("The player you're replacing isn't in this team.");
  if (input.inPlayerId === input.outPlayerId) throw Errors.validation("Pick a different replacement player.");
  if (members.some((m) => m.playerId === input.inPlayerId)) throw Errors.validation("That player is already in this team.");

  // Replacement must be registered in this tournament.
  const reg = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId: team.tournamentId ?? undefined, playerId: input.inPlayerId, status: "registered" },
  });
  if (!reg) throw Errors.validation("The replacement must be a player registered in this tournament.");

  // If the replacement is already on ANOTHER team in this tournament, we SWAP —
  // the outgoing player takes their spot — so both teams stay complete pairs
  // (rather than leaving the other team a player short).
  const inMembership = await prisma.teamPlayer.findFirst({
    where: { playerId: input.inPlayerId, status: "active", teamId: { not: teamId }, team: { tournamentId: team.tournamentId, deletedAt: null } },
    include: { team: { include: { teamPlayers: { include: { player: { select: { id: true, displayName: true } } } } } } },
  });
  const otherTeam = inMembership?.team ?? null;

  // Case C — a live match on EITHER team blocks the change.
  if (otherTeam) {
    const liveOther = await prisma.matchParticipant.count({
      where: { teamId: otherTeam.id, match: { status: "in_progress", deletedAt: null } },
    });
    if (liveOther > 0) throw Errors.conflict(`${otherTeam.name} currently has an active match. The pairing can be changed after it completes.`);
  }

  // A locked team involved requires an explicit second confirmation (force).
  if ((team.lockedAt || otherTeam?.lockedAt) && !input.force) {
    throw Errors.conflict("A team involved is locked. Confirm again to change the pairing.");
  }

  const inPlayer = await prisma.player.findUniqueOrThrow({ where: { id: input.inPlayerId }, select: { displayName: true } });
  const aBefore = members.map((m) => ({ id: m.playerId, name: m.player.displayName }));
  const aAfter = members.map((m) =>
    m.playerId === input.outPlayerId ? { id: input.inPlayerId, name: inPlayer.displayName } : { id: m.playerId, name: m.player.displayName }
  );

  await prisma.$transaction(async (tx) => {
    if (otherTeam && inMembership) {
      // SWAP between team A and otherTeam; keep each vacated slot's position.
      await tx.teamPlayer.delete({ where: { id: outMember.id } });
      await tx.teamPlayer.delete({ where: { id: inMembership.id } });
      await tx.teamPlayer.create({ data: { teamId, playerId: input.inPlayerId, position: outMember.position, status: "active" } });
      await tx.teamPlayer.create({ data: { teamId: otherTeam.id, playerId: input.outPlayerId, position: inMembership.position, status: "active" } });
    } else {
      // Plain replace — the outgoing player leaves the team (back to unassigned).
      await tx.teamPlayer.delete({ where: { id: outMember.id } });
      await tx.teamPlayer.create({ data: { teamId, playerId: input.inPlayerId, position: outMember.position, status: "active" } });
    }

    // Refresh the snapshot on still-SCHEDULED matches of the affected team(s);
    // in-progress / completed / cancelled matches stay frozen.
    const affectedTeamIds = otherTeam ? [teamId, otherTeam.id] : [teamId];
    const scheduled = await tx.matchParticipant.findMany({
      where: { teamId: { in: affectedTeamIds }, match: { status: "scheduled", deletedAt: null } },
      select: { matchId: true },
    });
    for (const mid of new Set(scheduled.map((s) => s.matchId))) {
      await attachMatchSnapshots(tx, mid);
    }

    await tx.teamPairingChange.create({
      data: {
        teamId,
        tournamentId: team.tournamentId,
        removedPlayerId: input.outPlayerId,
        addedPlayerId: input.inPlayerId,
        playersBefore: aBefore as unknown as Prisma.InputJsonValue,
        playersAfter: aAfter as unknown as Prisma.InputJsonValue,
        reason: input.reason,
        changedById: actor.id,
      },
    });
    // Record the mirror change on the other team when this was a swap.
    if (otherTeam && inMembership) {
      const bMembers = otherTeam.teamPlayers.filter((tp) => tp.status === "active");
      const bBefore = bMembers.map((m) => ({ id: m.playerId, name: m.player.displayName }));
      const bAfter = bMembers.map((m) =>
        m.playerId === input.inPlayerId ? { id: input.outPlayerId, name: outMember.player.displayName } : { id: m.playerId, name: m.player.displayName }
      );
      await tx.teamPairingChange.create({
        data: {
          teamId: otherTeam.id,
          tournamentId: team.tournamentId,
          removedPlayerId: input.inPlayerId,
          addedPlayerId: input.outPlayerId,
          playersBefore: bBefore as unknown as Prisma.InputJsonValue,
          playersAfter: bAfter as unknown as Prisma.InputJsonValue,
          reason: input.reason ? `Swap with ${team.name}: ${input.reason}` : `Swapped with ${team.name}`,
          changedById: actor.id,
        },
      });
    }
  });

  await audit({ actorUserId: actor.id, action: "team.pair_changed", entityType: "Team", entityId: teamId, previousValue: { players: aBefore }, newValue: { players: aAfter, reason: input.reason ?? null, swappedWith: otherTeam?.id ?? null } });
  return getTeam(actor, teamId);
}

/** Lock or unlock a team (a locked team needs an extra confirm to re-pair). */
export async function setTeamLock(actor: AuthUser, teamId: string, locked: boolean) {
  const team = await prisma.team.findFirst({ where: { id: teamId, deletedAt: null }, select: { organizationId: true } });
  if (!team) throw Errors.notFound("Team");
  assertOrgAccess(actor, team.organizationId);
  const updated = await prisma.team.update({ where: { id: teamId }, data: { lockedAt: locked ? new Date() : null }, include: teamInclude });
  await audit({ actorUserId: actor.id, action: locked ? "team.locked" : "team.unlocked", entityType: "Team", entityId: teamId });
  return updated;
}

/** The audit trail of pairing changes for a team (oldest first). */
export async function listTeamPairingChanges(actor: AuthUser, teamId: string) {
  const team = await prisma.team.findFirst({ where: { id: teamId, deletedAt: null }, select: { organizationId: true } });
  if (!team) throw Errors.notFound("Team");
  assertOrgAccess(actor, team.organizationId);
  return prisma.teamPairingChange.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });
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

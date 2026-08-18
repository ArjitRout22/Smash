import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { TOURNAMENT_TRANSITIONS, type TournamentStatus } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import { assertOrgAccess, ownOrgId, isPlatformAdmin } from "@/lib/auth/tenancy";
import { sendTournamentInviteEmail } from "@/lib/email/notifications";
import { LEAGUE_POINTS_CONFIG } from "@/lib/engines/points";
import { recomputeTournamentAndPlayers } from "@/lib/services/recompute";
import type {
  CreateTournamentSchema,
  UpdateTournamentSchema,
} from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateTournamentSchema>;
type UpdateInput = z.infer<typeof UpdateTournamentSchema>;

export async function listTournaments(actor: AuthUser, p: Pagination, filters: { status?: string }) {
  // A user's tournaments = ones in their workspace PLUS any they've joined/requested
  // as a player (e.g. a public tournament in another org). Admins see everything.
  const scope = isPlatformAdmin(actor)
    ? {}
    : {
        OR: [
          { organizationId: actor.organizationId ?? "__no_org__" },
          ...(actor.playerId
            ? [{ tournamentPlayers: { some: { playerId: actor.playerId, status: { in: ["registered", "requested"] } } } }]
            : []),
        ],
      };
  const where = {
    deletedAt: null,
    ...scope,
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
        // Exclude soft-deleted rows so a tile's match/team counts reflect what's
        // actually there (regenerating fixtures after a delete must not double it).
        _count: { select: { tournamentPlayers: true, teams: { where: { deletedAt: null } }, matches: { where: { deletedAt: null } } } },
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
      // Exclude soft-deleted rows so "At a glance" reflects what's actually there
      // (e.g. after deleting generated fixtures the match count must drop, not
      // keep counting the deletedAt rows).
      _count: {
        select: {
          tournamentPlayers: true,
          teams: { where: { deletedAt: null } },
          matches: { where: { deletedAt: null } },
          stages: true,
        },
      },
    },
  });
  if (!t) throw Errors.notFound("Tournament");
  await assertCanView(actor, t);
  const canManage = isPlatformAdmin(actor) || t.organizationId === actor.organizationId;
  // Who may enter scores for THIS tournament (mirrors assertCanScoreTournament):
  // a platform admin, the organizer/creator, or a nominated scorer. Everyone else
  // is view-only, so the UI can disable score controls instead of 403-ing them.
  const isScorer =
    !isPlatformAdmin(actor) && actor.id !== t.organizerId && actor.id !== t.createdById
      ? (await prisma.tournamentScorer.findUnique({
          where: { tournamentId_userId: { tournamentId: id, userId: actor.id } },
          select: { id: true },
        })) != null
      : false;
  const canScore = isPlatformAdmin(actor) || actor.id === t.organizerId || actor.id === t.createdById || isScorer;
  // The viewer's own participation status, so the UI shows Pending/Joined
  // instead of a stale "Request to join" (works for non-owners too).
  let viewerStatus: string | null = null;
  if (actor.playerId) {
    const part = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_playerId: { tournamentId: id, playerId: actor.playerId } },
      select: { status: true },
    });
    viewerStatus = part?.status ?? null;
  }
  return { ...t, canManage, canScore, viewerStatus };
}

/** True if the caller may VIEW this tournament (owner, public, or participant). */
async function assertCanView(
  actor: AuthUser,
  t: { organizationId: string | null; visibility: string; id: string }
): Promise<void> {
  if (isPlatformAdmin(actor)) return;
  if (t.organizationId === actor.organizationId) return;
  if (t.visibility === "public") return;
  // Private tournament in another workspace — visible to its participants and
  // to players who've been invited (so they can decide on the invite).
  if (actor.playerId) {
    const part = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_playerId: { tournamentId: t.id, playerId: actor.playerId } },
    });
    if (part && (part.status === "registered" || part.status === "invited")) return;
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
      locationLat: input.locationLat,
      locationLng: input.locationLng,
      startDate: input.startDate,
      endDate: input.endDate,
      format: input.format,
      visibility: input.visibility,
      organizerId: input.organizerId ?? actor.id,
      createdById: actor.id,
      organizationId: ownOrgId(actor),
      // New tournaments default to the League system (win 3 / close-loss 1 /
      // heavy-loss 0). Organizers can switch to International in Settings.
      pointsConfig: input.pointsConfig ?? LEAGUE_POINTS_CONFIG,
      status: "upcoming",
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

  // The scoring system drives the per-tournament standings, which are DERIVED
  // from stored results — so when it changes we recompute the leaderboard in the
  // same transaction, and the points table reflects the new rules immediately.
  const scoringChanged =
    input.pointsConfig !== undefined &&
    JSON.stringify(input.pointsConfig ?? null) !== JSON.stringify(existing.pointsConfig ?? null);
  // A status change to/from "completed" changes who holds the tournament title,
  // so the winner's (and ex-winner's) stats must be recomputed.
  const statusChanged = input.status !== undefined && input.status !== existing.status;

  const updated = await prisma.tournament.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      description: input.description === undefined ? undefined : input.description,
      location: input.location === undefined ? undefined : input.location,
      locationLat: input.locationLat === undefined ? undefined : input.locationLat,
      locationLng: input.locationLng === undefined ? undefined : input.locationLng,
      startDate: input.startDate === undefined ? undefined : input.startDate,
      endDate: input.endDate === undefined ? undefined : input.endDate,
      format: input.format ?? undefined,
      status: input.status ?? undefined,
      visibility: input.visibility ?? undefined,
      organizerId: input.organizerId ?? undefined,
      pointsConfig: input.pointsConfig === undefined ? undefined : input.pointsConfig ?? undefined,
    },
  });
  // Recompute standings + player stats AFTER the update (its own short
  // transactions), so a distant DB doesn't time out one giant transaction.
  if (scoringChanged || statusChanged) await recomputeTournamentAndPlayers(id);
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

/**
 * Owner/admin maintenance: recompute a tournament's leaderboard + every involved
 * player's aggregate stats (titles, wins, points, ranks). Useful after logic
 * changes to refresh an already-finished tournament without changing its data.
 */
export async function recomputeTournament(actor: AuthUser, tournamentId: string) {
  await loadOwnedTournament(actor, tournamentId);
  await recomputeTournamentAndPlayers(tournamentId);
  await audit({ actorUserId: actor.id, action: "tournament.recomputed", entityType: "Tournament", entityId: tournamentId });
  return { recomputed: true };
}

export async function softDeleteTournament(id: string, actor: AuthUser) {
  const existing = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, existing.organizationId);
  await prisma.tournament.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: "tournament.deleted", entityType: "Tournament", entityId: id, previousValue: existing });
}

export async function listTournamentPlayers(actor: AuthUser, tournamentId: string) {
  // Any viewer (owner, participant, or anyone for a public tournament) can read
  // the roster — so "who joined" is visible to all. Managers additionally see
  // pending rows (invited / requested); everyone else sees only confirmed
  // (registered) players, so invites/declines aren't leaked publicly.
  await loadViewableTournament(actor, tournamentId);
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true, createdById: true },
  });
  const canManage = isPlatformAdmin(actor) || actor.id === t?.organizerId || actor.id === t?.createdById;
  return prisma.tournamentPlayer.findMany({
    where: { tournamentId, ...(canManage ? {} : { status: "registered" }) },
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
  const [entries, tps, teams] = await Promise.all([
    prisma.leaderboardEntry.findMany({
      where: { tournamentId },
      include: {
        player: { select: { id: true, displayName: true, fullName: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ rank: "asc" }, { points: "desc" }],
    }),
    // Group labels for per-group standings (A, B, …).
    prisma.tournamentPlayer.findMany({ where: { tournamentId, group: { not: null } }, select: { playerId: true, group: true } }),
    prisma.team.findMany({ where: { tournamentId, group: { not: null } }, select: { id: true, group: true } }),
  ]);
  const playerGroup = new Map(tps.map((t) => [t.playerId, t.group]));
  const teamGroup = new Map(teams.map((t) => [t.id, t.group]));

  return entries.map((e) => ({
    rank: e.rank,
    position: e.position,
    stageReached: e.stageReached,
    matchesPlayed: e.matchesPlayed,
    wins: e.wins,
    losses: e.losses,
    points: e.points,
    group: e.teamId ? teamGroup.get(e.teamId) ?? null : e.playerId ? playerGroup.get(e.playerId) ?? null : null,
    entity: e.team
      ? { type: "team" as const, id: e.team.id, name: e.team.name }
      : e.player
        ? { type: "player" as const, id: e.player.id, name: e.player.displayName }
        : null,
  }));
}

// --- Public discovery + join requests (Phase 3) ----------------------------

/** Cross-workspace list of PUBLIC tournaments anyone can discover + join. */
export async function listPublicTournaments(
  actor: AuthUser,
  p: Pagination,
  filters: { status?: string }
) {
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
        // The viewer's own participation row (if any) so the UI can show
        // "Pending" / "Joined" instead of a stale "Request to join".
        tournamentPlayers: actor.playerId
          ? { where: { playerId: actor.playerId }, select: { status: true } }
          : false,
      },
    }),
    prisma.tournament.count({ where }),
  ]);
  return {
    items: items.map((t) => {
      const { tournamentPlayers, organizationId, ...rest } = t;
      return {
        ...rest,
        // requested | registered | invited | declined | withdrawn | removed | null
        viewerStatus: (tournamentPlayers as { status: string }[] | undefined)?.[0]?.status ?? null,
        isOwnWorkspace: organizationId != null && organizationId === actor.organizationId,
      };
    }),
    total,
  };
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
  // Only an upcoming tournament accepts new players — once it's ongoing/completed/
  // cancelled, registration is closed.
  if (t.status !== "upcoming") {
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

// --- Invitations (Phase 4): organizer invites any registered player ---------

/** Organizer invites a registered player (from anywhere in the app). */
/**
 * Single entry point for adding a player to a tournament (there is no separate
 * "add" flow). It resolves the right status automatically:
 *   - a player WITH an account → `invited` (they accept from their dashboard);
 *   - a managed player WITHOUT an account → `registered` directly (there is no
 *     one to accept an invitation, so the organizer rosters them);
 *   - a player who already `requested` to join → `registered` (accept the ask).
 * Re-inviting a `declined`/`removed`/`withdrawn` player is allowed. Returns the
 * row (its `status` tells the UI whether it invited or added).
 */
export async function inviteToTournament(actor: AuthUser, tournamentId: string, playerId: string) {
  const tournament = await loadOwnedTournament(actor, tournamentId);
  const player = await prisma.player.findFirst({
    where: { id: playerId, deletedAt: null },
    select: { id: true, displayName: true, user: { select: { id: true, email: true } } },
  });
  if (!player) throw Errors.validation("Player not found");
  const hasAccount = Boolean(player.user);

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  });
  if (existing?.status === "registered") throw Errors.conflict("This player is already in the tournament");
  if (existing?.status === "invited") throw Errors.conflict("This player has already been invited");

  // Account-holders opt in via an invitation; everyone else is rostered directly.
  const status = hasAccount && existing?.status !== "requested" ? "invited" : "registered";

  const tp = await prisma.tournamentPlayer.upsert({
    where: { tournamentId_playerId: { tournamentId, playerId } },
    update: { status },
    create: { tournamentId, playerId, status },
  });
  await audit({
    actorUserId: actor.id,
    action: status === "invited" ? "tournament.player.invited" : "tournament.player.added",
    entityType: "Tournament",
    entityId: tournamentId,
    newValue: { playerId, status },
  });

  // Notify the invitee by email (best-effort; never blocks the invite).
  if (status === "invited" && player.user?.email) {
    await sendTournamentInviteEmail({
      to: player.user.email,
      playerName: player.displayName,
      tournamentName: tournament.name,
      invitedByName: actor.name,
    });
  }
  return tp;
}

/** Pending invitations for the current user's player. */
export async function listMyInvitations(actor: AuthUser) {
  if (!actor.playerId) return [];
  return prisma.tournamentPlayer.findMany({
    where: { playerId: actor.playerId, status: "invited" },
    include: {
      tournament: {
        select: {
          id: true, name: true, format: true, status: true, visibility: true,
          organizer: { select: { name: true } },
          organization: { select: { name: true } },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });
}

/** Invited player accepts or declines. */
export async function respondToInvitation(actor: AuthUser, tournamentId: string, action: "accept" | "decline") {
  if (!actor.playerId) throw Errors.forbidden("You have no player profile");
  const tp = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId: actor.playerId } },
  });
  if (!tp || tp.status !== "invited") throw Errors.notFound("Invitation");
  const updated = await prisma.tournamentPlayer.update({
    where: { tournamentId_playerId: { tournamentId, playerId: actor.playerId } },
    data: { status: action === "accept" ? "registered" : "declined" },
  });
  await audit({ actorUserId: actor.id, action: `tournament.invitation.${action}ed`, entityType: "Tournament", entityId: tournamentId, newValue: { playerId: actor.playerId } });
  return updated;
}

/** Load a tournament and assert the caller's workspace owns it. */
export async function loadOwnedTournament(actor: AuthUser, tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, organizationId: true, format: true, name: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  assertOrgAccess(actor, t.organizationId);
  return t;
}

// --- Nominated scorers (item 5) --------------------------------------------

/** Owner: list the players nominated to help score this tournament. */
export async function listScorers(actor: AuthUser, tournamentId: string) {
  await loadOwnedTournament(actor, tournamentId);
  const rows = await prisma.tournamentScorer.findMany({
    where: { tournamentId },
    include: {
      user: { select: { id: true, name: true, email: true, player: { select: { id: true, displayName: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    userId: r.userId,
    playerId: r.user.player?.id ?? null,
    name: r.user.player?.displayName ?? r.user.name ?? r.user.email ?? "Player",
  }));
}

/** Owner: nominate a player (who must have an account) to also enter scores. */
export async function addScorer(actor: AuthUser, tournamentId: string, playerId: string) {
  await loadOwnedTournament(actor, tournamentId);
  const player = await prisma.player.findFirst({
    where: { id: playerId, deletedAt: null },
    include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
  });
  if (!player) throw Errors.notFound("Player");
  if (!player.user || !player.user.isActive || player.user.deletedAt) {
    throw Errors.validation("That player doesn't have an account, so they can't be nominated to score.");
  }
  await prisma.tournamentScorer.upsert({
    where: { tournamentId_userId: { tournamentId, userId: player.user.id } },
    update: {},
    create: { tournamentId, userId: player.user.id },
  });
  await audit({ actorUserId: actor.id, action: "tournament.scorer.added", entityType: "Tournament", entityId: tournamentId, newValue: { userId: player.user.id } });
  return { userId: player.user.id };
}

/** Owner: remove a nominated scorer. */
export async function removeScorer(actor: AuthUser, tournamentId: string, userId: string) {
  await loadOwnedTournament(actor, tournamentId);
  await prisma.tournamentScorer.deleteMany({ where: { tournamentId, userId } });
  await audit({ actorUserId: actor.id, action: "tournament.scorer.removed", entityType: "Tournament", entityId: tournamentId, previousValue: { userId } });
}

/**
 * May this user enter scores for the tournament? Allowed for a platform admin,
 * the tournament's organizer/creator, or a nominated scorer. Everyone else can
 * only view (item 5). Accepts a db client so it can run inside the score
 * transaction.
 */
export async function assertCanScoreTournament(
  actor: AuthUser,
  t: { id: string; organizerId: string; createdById: string },
  db: { tournamentScorer: typeof prisma.tournamentScorer } = prisma
) {
  if (isPlatformAdmin(actor)) return;
  if (t.organizerId === actor.id || t.createdById === actor.id) return;
  const scorer = await db.tournamentScorer.findUnique({
    where: { tournamentId_userId: { tournamentId: t.id, userId: actor.id } },
  });
  if (scorer) return;
  throw Errors.forbidden("Only the organizer or a nominated scorer can enter scores for this tournament.");
}

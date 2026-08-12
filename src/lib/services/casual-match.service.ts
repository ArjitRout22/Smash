import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { resolveMatch, type GameScore } from "@/lib/engines/scoring";
import type { Side } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import type {
  CreateCasualMatchInput,
  ReportCasualScoreInput,
  CasualMatchActionInput,
} from "@/lib/validation/schemas";

/**
 * Casual (individual) matches: player-vs-player games played OUTSIDE any
 * tournament. They live in their own table and never write to the point ledger
 * or rankings, so they are structurally excluded from ranked leaderboards and
 * stats. Both participants must have login accounts — the opponent accepts the
 * challenge, and BOTH must agree on the final score (one reports, the other
 * confirms) before it is marked completed.
 */

const playerSelect = { select: { id: true, displayName: true, fullName: true } } as const;
const withPlayers = {
  challengerPlayer: playerSelect,
  opponentPlayer: playerSelect,
  challengerPartnerPlayer: playerSelect,
  opponentPartnerPlayer: playerSelect,
} as const;

type RawCasualMatch = Prisma.CasualMatchGetPayload<{ include: typeof withPlayers }>;

type PartyPlayer = { id: string; displayName: string; fullName: string } | null;
function partyPlayer(p: PartyPlayer) {
  return p ? { playerId: p.id, name: p.displayName, fullName: p.fullName } : null;
}

/** All userIds tied to a match (both captains + both partners). */
function participantUserIds(m: RawCasualMatch): (string | null)[] {
  return [m.challengerUserId, m.opponentUserId, m.challengerPartnerUserId, m.opponentPartnerUserId];
}

/** Which side ("A" challenger / "B" opponent) a user plays on, if any. */
function sideOfUser(m: RawCasualMatch, userId: string | null): "A" | "B" | null {
  if (!userId) return null;
  if (userId === m.challengerUserId || userId === m.challengerPartnerUserId) return "A";
  if (userId === m.opponentUserId || userId === m.opponentPartnerUserId) return "B";
  return null;
}

/** Serialize a casual match FROM THE PERSPECTIVE of the current user. */
function serialize(m: RawCasualMatch, actor: AuthUser) {
  // Permissions are per-SIDE: any player on a side can act for their team. The
  // opposing team (whoever didn't report) accepts/rejects the reported score.
  const actorSide = sideOfUser(m, actor.id);
  const reporterSide = sideOfUser(m, m.reportedByUserId);
  const onChallengerSide = actorSide === "A";
  const onOpponentSide = actorSide === "B";
  const games = (m.games as GameScore[] | null) ?? [];

  return {
    id: m.id,
    matchType: m.matchType,
    status: m.status,
    bestOf: m.bestOf,
    scheduledAt: m.scheduledAt,
    location: m.location,
    locationLat: m.locationLat,
    locationLng: m.locationLng,
    challenger: {
      userId: m.challengerUserId,
      playerId: m.challengerPlayerId,
      name: m.challengerPlayer.displayName,
      fullName: m.challengerPlayer.fullName,
    },
    opponent: {
      userId: m.opponentUserId,
      playerId: m.opponentPlayerId,
      name: m.opponentPlayer.displayName,
      fullName: m.opponentPlayer.fullName,
    },
    challengerPartner: partyPlayer(m.challengerPartnerPlayer),
    opponentPartner: partyPlayer(m.opponentPartnerPlayer),
    games,
    winnerSide: m.winnerSide as Side | null,
    winnerPlayerId: m.winnerPlayerId,
    reportedByUserId: m.reportedByUserId,
    // The viewer's relationship + what they can do right now.
    role: onChallengerSide ? ("challenger" as const) : ("opponent" as const),
    isChallenger: onChallengerSide,
    // Action hints so the UI never shows a control the server would reject.
    // Any player on a side can act for their team; the OTHER team confirms.
    canRespond: onOpponentSide && m.status === "pending",
    canReport:
      m.status === "accepted" ||
      (m.status === "awaiting_confirmation" && actorSide === reporterSide),
    canConfirm:
      m.status === "awaiting_confirmation" && reporterSide != null && actorSide !== reporterSide,
    canCancel: ["pending", "accepted", "awaiting_confirmation"].includes(m.status),
    version: m.version,
    createdAt: m.createdAt,
    respondedAt: m.respondedAt,
    completedAt: m.completedAt,
  };
}

export type CasualMatchDTO = ReturnType<typeof serialize>;

/** Players who can be challenged: anyone (else) with a login account. */
export async function listCasualOpponents(actor: AuthUser, search?: string) {
  const players = await prisma.player.findMany({
    where: {
      deletedAt: null,
      user: { is: { deletedAt: null, isActive: true } },
      ...(actor.playerId ? { id: { not: actor.playerId } } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              { displayName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, displayName: true, fullName: true, city: true },
    orderBy: { fullName: "asc" },
    take: 20,
  });
  return players;
}

async function loadParticipantMatch(actor: AuthUser, id: string): Promise<RawCasualMatch> {
  const m = await prisma.casualMatch.findUnique({ where: { id }, include: withPlayers });
  if (!m) throw Errors.notFound("Match");
  if (!participantUserIds(m).includes(actor.id)) {
    // Don't reveal existence of matches the user isn't part of (any of 4 players).
    throw Errors.notFound("Match");
  }
  return m;
}

export async function getCasualMatch(actor: AuthUser, id: string) {
  return serialize(await loadParticipantMatch(actor, id), actor);
}

export async function listMyCasualMatches(
  actor: AuthUser,
  filters: { status?: string } = {}
) {
  const matches = await prisma.casualMatch.findMany({
    where: {
      // Any of the four players (both captains + both partners) sees the match.
      OR: [
        { challengerUserId: actor.id },
        { opponentUserId: actor.id },
        { challengerPartnerUserId: actor.id },
        { opponentPartnerUserId: actor.id },
      ],
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: withPlayers,
    orderBy: { updatedAt: "desc" },
  });
  return matches.map((m) => serialize(m, actor));
}

/** Resolve a player that must have an active login account, or throw. */
async function resolveAccountPlayer(playerId: string, label: string) {
  const p = await prisma.player.findFirst({
    where: { id: playerId, deletedAt: null },
    include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
  });
  if (!p) throw Errors.notFound("Player");
  if (!p.user || !p.user.isActive || p.user.deletedAt) {
    throw Errors.validation(`${label} doesn't have an account yet, so they can't play a casual match.`);
  }
  return { playerId: p.id, userId: p.user.id };
}

export async function createCasualMatch(actor: AuthUser, input: CreateCasualMatchInput) {
  if (!actor.playerId) {
    throw Errors.validation("Your account isn't linked to a player profile, so you can't challenge anyone.");
  }
  const isDoubles = input.matchType === "doubles";

  const opponent = await resolveAccountPlayer(input.opponentPlayerId, "The player you challenged");
  if (opponent.userId === actor.id) {
    throw Errors.validation("You can't challenge yourself.");
  }

  let challengerPartner: { playerId: string; userId: string } | null = null;
  let opponentPartner: { playerId: string; userId: string } | null = null;
  if (isDoubles) {
    if (!input.challengerPartnerPlayerId || !input.opponentPartnerPlayerId) {
      throw Errors.validation("Doubles matches need a partner on each side.");
    }
    challengerPartner = await resolveAccountPlayer(input.challengerPartnerPlayerId, "Your partner");
    opponentPartner = await resolveAccountPlayer(input.opponentPartnerPlayerId, "The opponent's partner");
    // All four must be different people.
    const players = [actor.playerId, opponent.playerId, challengerPartner.playerId, opponentPartner.playerId];
    if (new Set(players).size !== 4) {
      throw Errors.validation("Each of the four players must be a different person.");
    }
  }

  const created = await prisma.casualMatch.create({
    data: {
      matchType: input.matchType,
      challengerUserId: actor.id,
      challengerPlayerId: actor.playerId,
      opponentUserId: opponent.userId,
      opponentPlayerId: opponent.playerId,
      challengerPartnerUserId: challengerPartner?.userId ?? null,
      challengerPartnerPlayerId: challengerPartner?.playerId ?? null,
      opponentPartnerUserId: opponentPartner?.userId ?? null,
      opponentPartnerPlayerId: opponentPartner?.playerId ?? null,
      bestOf: input.bestOf,
      scheduledAt: input.scheduledAt,
      location: input.location,
      locationLat: input.locationLat ?? null,
      locationLng: input.locationLng ?? null,
      status: "pending",
    },
    include: withPlayers,
  });
  await audit({
    actorUserId: actor.id,
    action: "casual_match.created",
    entityType: "CasualMatch",
    entityId: created.id,
    newValue: { matchType: input.matchType, opponentPlayerId: opponent.playerId },
  });
  return serialize(created, actor);
}

/** Optimistic-concurrency guard shared by every state transition. */
function assertVersion(m: RawCasualMatch, expected?: number) {
  if (expected !== undefined && expected !== m.version) throw Errors.concurrency();
}

/** Report a completed result — moves the match to awaiting_confirmation. */
export async function reportCasualScore(
  actor: AuthUser,
  id: string,
  input: ReportCasualScoreInput
) {
  const m = await loadParticipantMatch(actor, id);
  assertVersion(m, input.expectedVersion);
  // Any player on either side can enter the result once the match is accepted;
  // while awaiting confirmation only the side that reported may amend it.
  const actorSide = sideOfUser(m, actor.id);
  const reporterSide = sideOfUser(m, m.reportedByUserId);
  const canReport =
    m.status === "accepted" || (m.status === "awaiting_confirmation" && actorSide === reporterSide);
  if (!canReport) {
    throw Errors.invalidState(
      m.status === "pending"
        ? "The opponent must accept the challenge before a score can be entered."
        : m.status === "awaiting_confirmation"
          ? "A result is already awaiting the other player's confirmation."
          : `Cannot report a score for a ${m.status} match.`
    );
  }

  // A reported casual result must be a completed match (a winner decided).
  const result = resolveMatch(m.bestOf, input.games);
  if (!result.complete || !result.winnerSide) {
    throw Errors.invalidScore("Enter the full result — a winner must be decided.");
  }
  const winnerPlayerId = result.winnerSide === "A" ? m.challengerPlayerId : m.opponentPlayerId;

  const updated = await prisma.casualMatch.update({
    where: { id: m.id, version: m.version },
    data: {
      games: input.games as unknown as Prisma.InputJsonValue,
      winnerSide: result.winnerSide,
      winnerPlayerId,
      reportedByUserId: actor.id,
      status: "awaiting_confirmation",
      version: { increment: 1 },
    },
    include: withPlayers,
  });
  await audit({
    actorUserId: actor.id,
    action: "casual_match.score_reported",
    entityType: "CasualMatch",
    entityId: m.id,
    newValue: { games: input.games, winnerSide: result.winnerSide },
  });
  return serialize(updated, actor);
}

/**
 * Drive a state transition: accept/decline a challenge, confirm/reject a
 * reported result, cancel, or reopen a completed match to correct it.
 */
export async function actOnCasualMatch(
  actor: AuthUser,
  id: string,
  input: CasualMatchActionInput
) {
  const m = await loadParticipantMatch(actor, id);
  assertVersion(m, input.expectedVersion);
  // Any player on a side can act for their team (participation already checked).
  const actorSide = sideOfUser(m, actor.id);

  let data: Prisma.CasualMatchUpdateInput;
  switch (input.action) {
    case "accept":
    case "decline": {
      // Any player on the challenged (opponent) team may accept/decline.
      if (actorSide !== "B") throw Errors.forbidden("Only the challenged team can respond.");
      if (m.status !== "pending") throw Errors.invalidState("This challenge has already been answered.");
      data = {
        status: input.action === "accept" ? "accepted" : "declined",
        respondedAt: new Date(),
        version: { increment: 1 },
      };
      break;
    }
    case "confirm":
    case "reject": {
      if (m.status !== "awaiting_confirmation") {
        throw Errors.invalidState("There is no reported result to confirm.");
      }
      // The OPPOSING team (whoever didn't report) confirms or rejects.
      if (actorSide === sideOfUser(m, m.reportedByUserId)) {
        throw Errors.forbidden("The other team must confirm the reported result.");
      }
      data =
        input.action === "confirm"
          ? { status: "completed", completedAt: new Date(), version: { increment: 1 } }
          : {
              // Rejected → back to playable; clear the disputed result.
              status: "accepted",
              games: Prisma.DbNull,
              winnerSide: null,
              winnerPlayerId: null,
              reportedByUserId: null,
              version: { increment: 1 },
            };
      break;
    }
    case "cancel": {
      if (!["pending", "accepted", "awaiting_confirmation"].includes(m.status)) {
        throw Errors.invalidState(`A ${m.status} match can't be cancelled.`);
      }
      data = { status: "cancelled", version: { increment: 1 } };
      break;
    }
    default:
      throw Errors.validation("Unknown action");
  }

  const updated = await prisma.casualMatch.update({
    where: { id: m.id, version: m.version },
    data,
    include: withPlayers,
  });
  await audit({
    actorUserId: actor.id,
    action: `casual_match.${input.action}`,
    entityType: "CasualMatch",
    entityId: m.id,
    previousValue: { status: m.status },
    newValue: { status: updated.status },
  });
  return serialize(updated, actor);
}

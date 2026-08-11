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

const withPlayers = {
  challengerPlayer: { select: { id: true, displayName: true, fullName: true } },
  opponentPlayer: { select: { id: true, displayName: true, fullName: true } },
} as const;

type RawCasualMatch = Prisma.CasualMatchGetPayload<{ include: typeof withPlayers }>;

/** Serialize a casual match FROM THE PERSPECTIVE of the current user. */
function serialize(m: RawCasualMatch, actor: AuthUser) {
  const isChallenger = m.challengerUserId === actor.id;
  const isReporter = m.reportedByUserId === actor.id;
  const games = (m.games as GameScore[] | null) ?? [];

  return {
    id: m.id,
    status: m.status,
    bestOf: m.bestOf,
    scheduledAt: m.scheduledAt,
    location: m.location,
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
    games,
    winnerSide: m.winnerSide as Side | null,
    winnerPlayerId: m.winnerPlayerId,
    reportedByUserId: m.reportedByUserId,
    // The viewer's relationship + what they can do right now.
    role: isChallenger ? ("challenger" as const) : ("opponent" as const),
    isChallenger,
    // Action hints so the UI never shows a control the server would reject.
    canRespond: !isChallenger && m.status === "pending",
    canReport:
      m.status === "accepted" ||
      (m.status === "awaiting_confirmation" && isReporter),
    canConfirm: m.status === "awaiting_confirmation" && !isReporter,
    canCancel: ["pending", "accepted", "awaiting_confirmation"].includes(m.status),
    canReopen: m.status === "completed",
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
  if (m.challengerUserId !== actor.id && m.opponentUserId !== actor.id) {
    // Don't reveal existence of matches the user isn't part of.
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
      OR: [{ challengerUserId: actor.id }, { opponentUserId: actor.id }],
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: withPlayers,
    orderBy: { updatedAt: "desc" },
  });
  return matches.map((m) => serialize(m, actor));
}

export async function createCasualMatch(actor: AuthUser, input: CreateCasualMatchInput) {
  if (!actor.playerId) {
    throw Errors.validation("Your account isn't linked to a player profile, so you can't challenge anyone.");
  }

  const opponent = await prisma.player.findFirst({
    where: { id: input.opponentPlayerId, deletedAt: null },
    include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
  });
  if (!opponent) throw Errors.notFound("Player");
  if (!opponent.user || !opponent.user.isActive || opponent.user.deletedAt) {
    throw Errors.validation("This player doesn't have an account yet, so they can't be challenged.");
  }
  if (opponent.user.id === actor.id) {
    throw Errors.validation("You can't challenge yourself.");
  }

  const created = await prisma.casualMatch.create({
    data: {
      challengerUserId: actor.id,
      challengerPlayerId: actor.playerId,
      opponentUserId: opponent.user.id,
      opponentPlayerId: opponent.id,
      bestOf: input.bestOf,
      scheduledAt: input.scheduledAt,
      location: input.location,
      status: "pending",
    },
    include: withPlayers,
  });
  await audit({
    actorUserId: actor.id,
    action: "casual_match.created",
    entityType: "CasualMatch",
    entityId: created.id,
    newValue: { opponentPlayerId: opponent.id },
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
  const isReporter = m.reportedByUserId === actor.id;
  const canReport =
    m.status === "accepted" || (m.status === "awaiting_confirmation" && isReporter);
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
  const isChallenger = m.challengerUserId === actor.id;

  let data: Prisma.CasualMatchUpdateInput;
  switch (input.action) {
    case "accept":
    case "decline": {
      if (isChallenger) throw Errors.forbidden("Only the opponent can respond to a challenge.");
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
      if (m.reportedByUserId === actor.id) {
        throw Errors.forbidden("The other player must confirm the result you reported.");
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
    case "reopen": {
      if (m.status !== "completed") throw Errors.invalidState("Only a completed match can be reopened.");
      data = {
        status: "accepted",
        games: Prisma.DbNull,
        winnerSide: null,
        winnerPlayerId: null,
        reportedByUserId: null,
        completedAt: null,
        version: { increment: 1 },
      };
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

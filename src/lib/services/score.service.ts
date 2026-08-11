import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { resolveMatch } from "@/lib/engines/scoring";
import { resolvePointsConfig, pointsForMatch } from "@/lib/engines/points";
import { recomputeAfterMatch } from "@/lib/services/recompute";
import type { Side, StageType } from "@/lib/domain/constants";
import type { SubmitScoreInput } from "@/lib/validation/schemas";
import type { AuthUser } from "@/lib/auth/authorize";
import { assertOrgAccess } from "@/lib/auth/tenancy";

type Tx = Prisma.TransactionClient;

/** Resolve the player ids belonging to a match side (1 for singles, 2 for doubles). */
async function sidePlayerIds(tx: Tx, part: { playerId: string | null; teamId: string | null }) {
  if (part.playerId) return [part.playerId];
  if (part.teamId) {
    const members = await tx.teamPlayer.findMany({
      where: { teamId: part.teamId },
      select: { playerId: true },
    });
    return members.map((m) => m.playerId);
  }
  return [];
}

/**
 * Propagate a winner into the next bracket match. If the downstream slot's
 * occupant changes, the downstream match's result is invalidated and the change
 * cascades forward, keeping the whole bracket consistent after a correction.
 */
async function propagateWinner(
  tx: Tx,
  match: { id: string; nextMatchId: string | null; nextMatchSlot: string | null },
  winner: { playerId: string | null; teamId: string | null } | null
) {
  if (!match.nextMatchId || !match.nextMatchSlot) return;
  const side = match.nextMatchSlot as Side;

  const next = await tx.match.findUnique({
    where: { id: match.nextMatchId },
    include: { participants: true },
  });
  if (!next) return;

  const existing = next.participants.find((p) => p.side === side) ?? null;
  const sameOccupant =
    (existing?.playerId ?? null) === (winner?.playerId ?? null) &&
    (existing?.teamId ?? null) === (winner?.teamId ?? null);
  if (sameOccupant) return; // nothing changed downstream

  // Update the downstream slot.
  if (existing) {
    if (winner) {
      await tx.matchParticipant.update({
        where: { id: existing.id },
        data: { playerId: winner.playerId, teamId: winner.teamId, isWinner: false, gamesWon: 0 },
      });
    } else {
      await tx.matchParticipant.delete({ where: { id: existing.id } });
    }
  } else if (winner) {
    await tx.matchParticipant.create({
      data: { matchId: next.id, side, playerId: winner.playerId, teamId: winner.teamId },
    });
  }

  // The downstream match's composition changed → invalidate its result.
  if (next.status === "completed" || next.status === "in_progress" || next.winnerSide) {
    await tx.game.deleteMany({ where: { matchId: next.id } });
    await tx.pointTransaction.deleteMany({ where: { matchId: next.id } });
    await tx.matchParticipant.updateMany({
      where: { matchId: next.id },
      data: { isWinner: false, gamesWon: 0 },
    });
    await tx.match.update({
      where: { id: next.id },
      data: { status: "scheduled", winnerSide: null, version: { increment: 1 } },
    });
    // Cascade: the now-undecided downstream match feeds nothing forward.
    await propagateWinner(tx, next, null);
  }
}

/** Mark a stage complete when all its matches are done, and activate the next. */
async function maybeAdvanceStages(tx: Tx, tournamentId: string) {
  const stages = await tx.stage.findMany({
    where: { tournamentId },
    orderBy: { order: "asc" },
    include: { matches: { where: { deletedAt: null }, select: { status: true } } },
  });
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.matches.length === 0) continue;
    const allDone = s.matches.every((m) => m.status === "completed" || m.status === "cancelled");
    const desired = allDone ? "completed" : s.status === "pending" ? "active" : s.status;
    if (desired !== s.status) {
      await tx.stage.update({ where: { id: s.id }, data: { status: desired } });
    }
    if (allDone) {
      const nextStage = stages[i + 1];
      if (nextStage && nextStage.status === "pending") {
        await tx.stage.update({ where: { id: nextStage.id }, data: { status: "active" } });
      }
    }
  }
}

/** All player ids that have any stake in a tournament (bounded by field size). */
async function tournamentPlayerIds(tx: Tx, tournamentId: string): Promise<string[]> {
  const ids = new Set<string>();
  (await tx.tournamentPlayer.findMany({ where: { tournamentId }, select: { playerId: true } })).forEach(
    (t) => ids.add(t.playerId)
  );
  const teams = await tx.team.findMany({ where: { tournamentId }, select: { id: true } });
  if (teams.length) {
    (
      await tx.teamPlayer.findMany({
        where: { teamId: { in: teams.map((t) => t.id) } },
        select: { playerId: true },
      })
    ).forEach((t) => ids.add(t.playerId));
  }
  (
    await tx.pointTransaction.findMany({
      where: { tournamentId },
      select: { playerId: true },
      distinct: ["playerId"],
    })
  ).forEach((p) => ids.add(p.playerId));
  // Also any players sitting in bracket slots via direct participation.
  (
    await tx.matchParticipant.findMany({
      where: { match: { tournamentId }, playerId: { not: null } },
      select: { playerId: true },
    })
  ).forEach((p) => p.playerId && ids.add(p.playerId));
  return [...ids];
}

export type SubmitScoreResult = {
  matchId: string;
  status: string;
  winnerSide: Side | null;
  version: number;
};

/**
 * Submit or correct a match score. Fully transactional: games, participants,
 * point ledger, bracket progression, tournament + global standings, and the
 * audit log all commit together or not at all.
 */
export async function submitScore(
  matchId: string,
  input: SubmitScoreInput,
  actor: AuthUser
): Promise<SubmitScoreResult> {
  const actorUserId = actor.id;
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: {
        participants: true,
        stage: true,
        games: true,
        tournament: { select: { organizationId: true } },
      },
    });
    if (!match) throw Errors.notFound("Match");
    assertOrgAccess(actor, match.tournament.organizationId);
    if (match.status === "cancelled") {
      throw Errors.invalidState("Cannot score a cancelled match");
    }

    const sideA = match.participants.find((p) => p.side === "A");
    const sideB = match.participants.find((p) => p.side === "B");
    if (!sideA || !sideB) {
      throw Errors.invalidMatchConfig("Both sides must be assigned before scoring");
    }

    // Optimistic concurrency (fail fast if the client's view is stale).
    if (input.expectedVersion !== undefined && input.expectedVersion !== match.version) {
      throw Errors.concurrency();
    }

    // Validate the score against badminton rules.
    const result = resolveMatch(match.bestOf, input.games);

    const previous = {
      status: match.status,
      winnerSide: match.winnerSide,
      games: match.games.map((g) => ({ gameNumber: g.gameNumber, scoreA: g.scoreA, scoreB: g.scoreB })),
    };

    // Atomic version guard: this update only succeeds if nobody else moved
    // the version underneath us (prevents concurrent double-writes).
    const guarded = await tx.match.updateMany({
      where: { id: match.id, version: match.version },
      data: {
        status: result.complete ? "completed" : "in_progress",
        winnerSide: result.winnerSide,
        version: { increment: 1 },
      },
    });
    if (guarded.count === 0) throw Errors.concurrency();
    const newVersion = match.version + 1;

    // Rewrite games.
    await tx.game.deleteMany({ where: { matchId: match.id } });
    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i];
      await tx.game.create({
        data: {
          matchId: match.id,
          gameNumber: i + 1,
          scoreA: g.scoreA,
          scoreB: g.scoreB,
          winnerSide: result.gameWinners[i] ?? null,
        },
      });
    }

    // Update participants.
    await tx.matchParticipant.update({
      where: { id: sideA.id },
      data: { isWinner: result.winnerSide === "A", gamesWon: result.gamesWonA },
    });
    await tx.matchParticipant.update({
      where: { id: sideB.id },
      data: { isWinner: result.winnerSide === "B", gamesWon: result.gamesWonB },
    });

    // Rewrite the match-scoped point ledger.
    await tx.pointTransaction.deleteMany({ where: { matchId: match.id } });
    if (result.complete && result.winnerSide) {
      const tournament = await tx.tournament.findUnique({
        where: { id: match.tournamentId },
        select: { pointsConfig: true },
      });
      const config = resolvePointsConfig(tournament?.pointsConfig ?? undefined);
      const stageType = (match.stage?.type ?? null) as StageType | null;

      for (const part of [sideA, sideB]) {
        const isWinner = result.winnerSide === part.side;
        const awards = pointsForMatch({ config, isWinner, stageType });
        const playerIds = await sidePlayerIds(tx, part);
        for (const playerId of playerIds) {
          for (const a of awards) {
            await tx.pointTransaction.create({
              data: {
                playerId,
                tournamentId: match.tournamentId,
                matchId: match.id,
                stageId: match.stageId,
                type: a.type,
                points: a.points,
                reason: a.reason,
                createdById: actorUserId,
              },
            });
          }
        }
      }
    }

    // Bracket progression.
    const winnerPart = result.winnerSide === "A" ? sideA : result.winnerSide === "B" ? sideB : null;
    await propagateWinner(
      tx,
      match,
      winnerPart ? { playerId: winnerPart.playerId, teamId: winnerPart.teamId } : null
    );

    await maybeAdvanceStages(tx, match.tournamentId);

    // Recompute all derived standings for the tournament + affected players.
    const playerIds = await tournamentPlayerIds(tx, match.tournamentId);
    await recomputeAfterMatch(tx, match.tournamentId, playerIds);

    await audit(
      {
        actorUserId,
        action: previous.status === "completed" ? "match.score.corrected" : "match.score.submitted",
        entityType: "Match",
        entityId: match.id,
        previousValue: previous,
        newValue: {
          status: result.complete ? "completed" : "in_progress",
          winnerSide: result.winnerSide,
          games: input.games,
        },
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
      tx
    );

    return {
      matchId: match.id,
      status: result.complete ? "completed" : "in_progress",
      winnerSide: result.winnerSide,
      version: newVersion,
    };
  });
}

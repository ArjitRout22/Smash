import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { resolveMatch } from "@/lib/engines/scoring";
import { resolvePointsConfig, pointsForMatch } from "@/lib/engines/points";
import { recomputeAfterMatch, involvedPlayerIds, recomputeGlobalElo, applyMatchElo } from "@/lib/services/recompute";
import { attachMatchSnapshots } from "@/lib/services/match.service";
import type { Side, StageType } from "@/lib/domain/constants";
import type { SubmitScoreInput } from "@/lib/validation/schemas";
import type { AuthUser } from "@/lib/auth/authorize";
import { assertCanScoreTournament } from "@/lib/services/tournament.service";

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

  // Snapshot the advancing team's current players into the (still-scheduled)
  // downstream slot, so a later pair change updates it until it's played.
  if (winner?.teamId) await attachMatchSnapshots(tx, next.id);

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
      // Also clear the auto-lock: an invalidated downstream match must be
      // re-scorable without a manual reopen.
      data: { status: "scheduled", winnerSide: null, closedAt: null, version: { increment: 1 } },
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

export type SubmitScoreResult = {
  matchId: string;
  status: string;
  winnerSide: Side | null;
  version: number;
  /** True when this was a re-score of an already-completed match (vs a first score). */
  corrected: boolean;
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
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: {
        participants: true,
        stage: true,
        games: true,
        tournament: { select: { id: true, organizerId: true, createdById: true } },
      },
    });
    if (!match) throw Errors.notFound("Match");
    // Only the organizer/creator, a platform admin, or a nominated scorer may
    // enter scores; everyone else is view-only (item 5).
    await assertCanScoreTournament(actor, match.tournament, tx);
    if (match.status === "cancelled") {
      throw Errors.invalidState("Cannot score a cancelled match");
    }
    if (match.closedAt != null) {
      throw Errors.invalidState("This match is closed. Reopen it to change the score.");
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
        // The saved result supersedes the cosmetic live running score.
        liveA: null,
        liveB: null,
        // Lock the result as soon as a match completes — a scored tournament
        // match can't be edited until an organizer deliberately reopens it.
        closedAt: result.complete ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (guarded.count === 0) throw Errors.concurrency();
    const newVersion = match.version + 1;

    // Rewrite games (single round-trip via createMany).
    await tx.game.deleteMany({ where: { matchId: match.id } });
    await tx.game.createMany({
      data: input.games.map((g, i) => ({
        matchId: match.id,
        gameNumber: i + 1,
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        winnerSide: result.gameWinners[i] ?? null,
      })),
    });

    // Update participants.
    await tx.matchParticipant.update({
      where: { id: sideA.id },
      data: { isWinner: result.winnerSide === "A", gamesWon: result.gamesWonA },
    });
    await tx.matchParticipant.update({
      where: { id: sideB.id },
      data: { isWinner: result.winnerSide === "B", gamesWon: result.gamesWonB },
    });

    // Rewrite the match-scoped point ledger (batched into one createMany).
    await tx.pointTransaction.deleteMany({ where: { matchId: match.id } });
    if (result.complete && result.winnerSide) {
      const tournament = await tx.tournament.findUnique({
        where: { id: match.tournamentId },
        select: { pointsConfig: true },
      });
      const config = resolvePointsConfig(tournament?.pointsConfig ?? undefined);
      const stageType = (match.stage?.type ?? null) as StageType | null;

      // Each side's representative score = the highest it reached in any game.
      // Used to test the league consolation floor (e.g. "lost but reached 15").
      const maxScoreA = Math.max(0, ...input.games.map((g) => g.scoreA));
      const maxScoreB = Math.max(0, ...input.games.map((g) => g.scoreB));

      const ledgerRows: Prisma.PointTransactionCreateManyInput[] = [];
      for (const part of [sideA, sideB]) {
        const isWinner = result.winnerSide === part.side;
        const sideScore = part.side === "A" ? maxScoreA : maxScoreB;
        const awards = pointsForMatch({ config, isWinner, stageType, sideScore });
        const playerIds = await sidePlayerIds(tx, part);
        for (const playerId of playerIds) {
          for (const a of awards) {
            ledgerRows.push({
              playerId,
              tournamentId: match.tournamentId,
              matchId: match.id,
              stageId: match.stageId,
              type: a.type,
              points: a.points,
              reason: a.reason,
              createdById: actorUserId,
            });
          }
        }
      }
      if (ledgerRows.length) await tx.pointTransaction.createMany({ data: ledgerRows });
    }

    // Bracket progression.
    const winnerPart = result.winnerSide === "A" ? sideA : result.winnerSide === "B" ? sideB : null;
    await propagateWinner(
      tx,
      match,
      winnerPart ? { playerId: winnerPart.playerId, teamId: winnerPart.teamId } : null
    );

    await maybeAdvanceStages(tx, match.tournamentId);

    // Recompute derived standings: the tournament leaderboard (rebuilt in full,
    // one bounded op) + ONLY the players who actually played this match. A single
    // score can't change any other player's global aggregate (their win/loss,
    // points and titles are unaffected until the tournament itself is marked
    // completed, which recomputes the whole field separately). Recomputing every
    // registered player here was the main cause of slow "Save score" on large
    // fields — each player added ~5+ cross-region round-trips inside the txn.
    const playerIds = await involvedPlayerIds(tx, match.id);
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
      corrected: previous.status === "completed",
    };
    // Raise the interactive-transaction limits well above Prisma's 5s default:
    // scoring rewrites games/ledger and recomputes tournament + global standings
    // in one atomic unit, which on a remote (Neon) DB can exceed 5s and abort
    // with P2028 — surfacing to users as a generic 500 on "Save score".
  }, { maxWait: 15000, timeout: 30000 });
  // Elo, outside the per-match transaction: a brand-new completion is the latest
  // result, so apply it incrementally (O(1)); a correction to an already-scored
  // match changes history and needs a full replay. In-progress saves don't count.
  if (result.status === "completed") {
    if (result.corrected) await recomputeGlobalElo();
    else await applyMatchElo(result.matchId);
  }
  return result;
}

/**
 * Undo a match's result: wipe its games + point-ledger, clear the winner, and put
 * it back to `scheduled` (as if never played) — then recompute the tournament +
 * global standings so the leaderboard and every affected player's stats reflect
 * the reversal. The participants (teams/players) and the match itself are kept;
 * only the *result* is cleared. Used to fix a match scored by mistake.
 *
 * Scorer-gated (same rule as saving a score). If the match fed a bracket slot,
 * that downstream slot is vacated too, keeping the bracket consistent.
 */
export async function resetMatchResult(actor: AuthUser, matchId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: {
        participants: true,
        tournament: { select: { id: true, organizerId: true, createdById: true } },
      },
    });
    if (!match) throw Errors.notFound("Match");
    await assertCanScoreTournament(actor, match.tournament, tx);

    const wasScored = match.status !== "scheduled" || match.winnerSide != null || match.closedAt != null;

    // Clear the recorded result.
    await tx.game.deleteMany({ where: { matchId: match.id } });
    await tx.pointTransaction.deleteMany({ where: { matchId: match.id } });
    // Vacate any downstream bracket slot this match had fed.
    await propagateWinner(tx, match, null);
    await tx.matchParticipant.updateMany({
      where: { matchId: match.id },
      data: { isWinner: false, gamesWon: 0 },
    });
    await tx.match.update({
      where: { id: match.id },
      data: {
        status: "scheduled",
        winnerSide: null,
        closedAt: null,
        liveA: null,
        liveB: null,
        version: { increment: 1 },
      },
    });

    // Roll stage status back if this reversal makes a "completed" stage active
    // again, then recompute every derived standing for the tournament.
    await maybeAdvanceStages(tx, match.tournamentId);
    // Only the players who played this match are affected (see submitScore).
    const playerIds = await involvedPlayerIds(tx, match.id);
    await recomputeAfterMatch(tx, match.tournamentId, playerIds);

    if (wasScored) {
      await audit(
        {
          actorUserId: actor.id,
          action: "match.result.reset",
          entityType: "Match",
          entityId: match.id,
          previousValue: { status: match.status, winnerSide: match.winnerSide },
          newValue: { status: "scheduled" },
        },
        tx
      );
    }
    return { matchId: match.id, status: "scheduled" as const, wasScored };
  }, { maxWait: 15000, timeout: 30000 });
  // Refresh global Elo after the reversal (outside the per-match transaction).
  await recomputeGlobalElo();
  return result;
}

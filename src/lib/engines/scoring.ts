import { Errors } from "@/lib/errors";
import type { Side } from "@/lib/domain/constants";

/**
 * Badminton scoring engine — pure, no DB, fully unit-tested.
 *
 * Rules are supplied via a config object so they can be tuned or extended
 * (different point targets, no-cap formats, etc.) WITHOUT touching call sites
 * or the UI. Defaults implement standard BWF rally scoring.
 */
export type ScoringRules = {
  pointsToWin: number; // first to this many points…
  winBy: number; // …with at least this margin
  cap: number; // hard ceiling: at (cap-1)-(cap-1), next point wins
};

export const BWF_RULES: ScoringRules = { pointsToWin: 21, winBy: 2, cap: 30 };

export type GameScore = { scoreA: number; scoreB: number };

function assertIntInRange(n: number, max: number, label: string) {
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw Errors.invalidScore(`${label} must be an integer between 0 and ${max}`);
  }
}

/**
 * Determine the winner of a COMPLETED game, validating it against the rules.
 * Throws INVALID_SCORE if the pair is not a legal finished game.
 */
export function completedGameWinner(
  scoreA: number,
  scoreB: number,
  rules: ScoringRules = BWF_RULES
): Side {
  assertIntInRange(scoreA, rules.cap, "Game score");
  assertIntInRange(scoreB, rules.cap, "Game score");

  if (scoreA === scoreB) {
    throw Errors.invalidScore("A game cannot end in a tie");
  }

  const winnerScore = Math.max(scoreA, scoreB);
  const loserScore = Math.min(scoreA, scoreB);
  const winner: Side = scoreA > scoreB ? "A" : "B";

  const { pointsToWin, winBy, cap } = rules;

  const legal =
    winnerScore === cap
      ? // reached the hard cap: only possible finishing scores are cap-1 / cap-2 loser
        loserScore >= cap - winBy && loserScore <= cap - 1
      : winnerScore >= pointsToWin &&
        (winnerScore - loserScore === winBy ||
          (winnerScore === pointsToWin && loserScore <= pointsToWin - winBy));

  if (!legal) {
    throw Errors.invalidScore(
      `${scoreA}-${scoreB} is not a valid ${pointsToWin}-point game (win by ${winBy}, cap ${cap})`
    );
  }
  return winner;
}

/** Is this a legal finished game? (non-throwing convenience) */
export function isCompletedGame(
  scoreA: number,
  scoreB: number,
  rules: ScoringRules = BWF_RULES
): boolean {
  try {
    completedGameWinner(scoreA, scoreB, rules);
    return true;
  } catch {
    return false;
  }
}

export type MatchResult = {
  complete: boolean;
  winnerSide: Side | null;
  gamesWonA: number;
  gamesWonB: number;
  gameWinners: (Side | null)[];
};

/**
 * Evaluate a best-of-N match from its ordered games.
 * Validates: bestOf ∈ {1,3}, each game legal, no games played after the match
 * was already decided, and the correct number of games overall.
 */
export function resolveMatch(
  bestOf: number,
  games: GameScore[],
  rules: ScoringRules = BWF_RULES
): MatchResult {
  if (bestOf !== 1 && bestOf !== 3) {
    throw Errors.invalidMatchConfig("bestOf must be 1 or 3");
  }
  const needed = bestOf === 1 ? 1 : 2;
  const maxGames = bestOf; // 1 or 3

  if (games.length > maxGames) {
    throw Errors.invalidScore(`A best-of-${bestOf} match can have at most ${maxGames} games`);
  }

  let gamesWonA = 0;
  let gamesWonB = 0;
  const gameWinners: (Side | null)[] = [];
  let decidedAt = -1;

  for (let i = 0; i < games.length; i++) {
    const w = completedGameWinner(games[i].scoreA, games[i].scoreB, rules);
    gameWinners.push(w);
    if (w === "A") gamesWonA++;
    else gamesWonB++;

    if (decidedAt === -1 && (gamesWonA === needed || gamesWonB === needed)) {
      decidedAt = i;
    }
  }

  // No games may be recorded after the match is already decided.
  if (decidedAt !== -1 && decidedAt !== games.length - 1) {
    throw Errors.invalidScore("Extra games recorded after the match was already decided");
  }

  const complete = gamesWonA === needed || gamesWonB === needed;
  const winnerSide: Side | null = complete ? (gamesWonA === needed ? "A" : "B") : null;

  return { complete, winnerSide, gamesWonA, gamesWonB, gameWinners };
}

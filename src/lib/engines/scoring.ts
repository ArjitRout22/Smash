import { Errors } from "@/lib/errors";
import type { Side } from "@/lib/domain/constants";

/**
 * Badminton scoring engine — pure, no DB, fully unit-tested.
 *
 * Rules are supplied via a config object so they can be tuned or extended
 * (different point targets, win-by-2/BWF, no-cap formats, etc.) WITHOUT touching
 * call sites or the UI. The DEFAULT is "first to 21, win by 1" (no deuce/cap).
 */
export type ScoringRules = {
  pointsToWin: number; // first to this many points…
  winBy: number; // …with at least this margin (1 = no deuce; play stops at the target)
  cap: number; // hard ceiling: at (cap-1)-(cap-1), next point wins (win-by ≥ 2 only)
};

/**
 * Default scoring: first to 21, WIN BY 1 — a game is decided the moment a side
 * reaches 21, so 21-20 and 21-15 are both valid (no deuce, no 30-point cap).
 * The engine still supports classic win-by-N (e.g. BWF's win-by-2, cap 30) via a
 * custom `ScoringRules`; see BWF_RULES.
 */
export const DEFAULT_RULES: ScoringRules = { pointsToWin: 21, winBy: 1, cap: 21 };

/** Classic BWF rally scoring (win by 2, cap 30) — available for tournaments that want it. */
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
  rules: ScoringRules = DEFAULT_RULES
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

  let legal: boolean;
  if (winBy <= 1) {
    // Win by 1: the game is decided the instant a side reaches the target, so a
    // completed game has the winner EXACTLY at pointsToWin (no deuce, no cap) and
    // the loser anywhere below it. (loserScore < winnerScore always holds here.)
    legal = winnerScore === pointsToWin && loserScore < winnerScore;
  } else {
    legal =
      winnerScore === cap
        ? // reached the hard cap: only possible finishing scores are cap-1 / cap-2 loser
          loserScore >= cap - winBy && loserScore <= cap - 1
        : winnerScore >= pointsToWin &&
          (winnerScore - loserScore === winBy ||
            (winnerScore === pointsToWin && loserScore <= pointsToWin - winBy));
  }

  if (!legal) {
    throw Errors.invalidScore(
      winBy <= 1
        ? `${scoreA}-${scoreB} is not a valid game — the winner must reach exactly ${pointsToWin} points`
        : `${scoreA}-${scoreB} is not a valid ${pointsToWin}-point game (win by ${winBy}, cap ${cap})`
    );
  }
  return winner;
}

/** Is this a legal finished game? (non-throwing convenience) */
export function isCompletedGame(
  scoreA: number,
  scoreB: number,
  rules: ScoringRules = DEFAULT_RULES
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
  rules: ScoringRules = DEFAULT_RULES
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

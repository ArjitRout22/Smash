/**
 * Elo rating engine (pure, deterministic, no I/O). The SINGLE source of the Elo
 * formulas — never duplicate these in APIs/components.
 *
 * Ratings are computed by replaying a category's matches in chronological order:
 * for each match we read the players' ratings BEFORE it, compute the expected
 * score, apply a zero-sum change, and carry the updated ratings into the next
 * match. Singles and doubles are replayed as SEPARATE pools (never mixed).
 *
 * K-factor (the swing size) is decided PER MATCH so every match stays zero-sum:
 * PROVISIONAL_K while any participant is still provisional (fewer than
 * PROVISIONAL_MATCHES rated matches in that category), otherwise ESTABLISHED_K.
 */

export const ELO_CONFIG = {
  STARTING_RATING: 1000,
  PROVISIONAL_MATCHES: 5,
  PROVISIONAL_K: 32,
  ESTABLISHED_K: 24,
  ELO_SCALE: 400,
} as const;

export type EloConfig = typeof ELO_CONFIG;

// Back-compat aliases (older call sites import these).
export const ELO_START = ELO_CONFIG.STARTING_RATING;
export const ELO_K = ELO_CONFIG.PROVISIONAL_K;

/** Probability that side A beats side B given their current ratings. */
export function eloExpected(ratingA: number, ratingB: number, scale: number = ELO_CONFIG.ELO_SCALE): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / scale));
}

/**
 * Rating change for side A after one match (side B gets the negative — zero-sum).
 * Rounded once so the two sides mirror exactly.
 */
export function eloDelta(ratingA: number, ratingB: number, winner: "A" | "B", k: number, scale: number = ELO_CONFIG.ELO_SCALE): number {
  const expectedA = eloExpected(ratingA, ratingB, scale);
  const scoreA = winner === "A" ? 1 : 0;
  return Math.round(k * (scoreA - expectedA));
}

const avg = (nums: number[]): number => nums.reduce((s, n) => s + n, 0) / nums.length;

export type EloMatchInput = {
  matchId: string;
  /** Player ids on side A (1 for singles, 2 for doubles). */
  sideA: string[];
  /** Player ids on side B. */
  sideB: string[];
  /** Which side won. */
  winner: "A" | "B";
  /** Match timestamp (ISO) — carried through to history rows. */
  playedAt: string;
};

/** One player's rating movement in one match — the full audit trail (point 9). */
export type RatingHistoryRow = {
  matchId: string;
  playerId: string;
  side: "A" | "B";
  opponentIds: string[];
  teammateIds: string[];
  ratingBefore: number;
  teamRatingBefore: number;
  opponentRatingBefore: number;
  expectedScore: number;
  actualScore: 0 | 1;
  k: number;
  ratingChange: number;
  ratingAfter: number;
  matchesBefore: number;
  playedAt: string;
};

export type ReplayResult = {
  ratings: Map<string, number>;
  matches: Map<string, number>;
  wins: Map<string, number>;
  losses: Map<string, number>;
  /** The last rating change per player (for the ▲▼ trend). */
  lastChange: Map<string, number>;
  history: RatingHistoryRow[];
};

/**
 * Replay one category's matches (already sorted chronologically) into final
 * ratings + per-player counts + a full rating history. Every match is zero-sum:
 * the winning side's total gain equals the losing side's total loss.
 */
export function replayElo(matches: EloMatchInput[], cfg: EloConfig = ELO_CONFIG): ReplayResult {
  const ratings = new Map<string, number>();
  const matchCount = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const lastChange = new Map<string, number>();
  const history: RatingHistoryRow[] = [];

  const getR = (id: string) => ratings.get(id) ?? cfg.STARTING_RATING;
  const getC = (id: string) => matchCount.get(id) ?? 0;

  for (const m of matches) {
    if (!m.sideA.length || !m.sideB.length) continue;

    const teamA = avg(m.sideA.map(getR));
    const teamB = avg(m.sideB.map(getR));
    const eA = eloExpected(teamA, teamB, cfg.ELO_SCALE);

    // Shared K keeps the match zero-sum: provisional if ANY participant is still
    // provisional; established only once everyone in the match is established.
    const anyProvisional = [...m.sideA, ...m.sideB].some((id) => getC(id) < cfg.PROVISIONAL_MATCHES);
    const k = anyProvisional ? cfg.PROVISIONAL_K : cfg.ESTABLISHED_K;

    // Round once and mirror so points are never created or destroyed.
    const deltaA = eloDelta(teamA, teamB, m.winner, k, cfg.ELO_SCALE);

    for (const side of ["A", "B"] as const) {
      const ids = side === "A" ? m.sideA : m.sideB;
      const teamRating = side === "A" ? teamA : teamB;
      const oppRating = side === "A" ? teamB : teamA;
      const oppIds = side === "A" ? m.sideB : m.sideA;
      const delta = side === "A" ? deltaA : -deltaA;
      const expected = side === "A" ? eA : 1 - eA;
      const actual: 0 | 1 = side === m.winner ? 1 : 0;
      for (const id of ids) {
        const before = getR(id);
        history.push({
          matchId: m.matchId,
          playerId: id,
          side,
          opponentIds: oppIds,
          teammateIds: ids.filter((x) => x !== id),
          ratingBefore: before,
          teamRatingBefore: teamRating,
          opponentRatingBefore: oppRating,
          expectedScore: expected,
          actualScore: actual,
          k,
          ratingChange: delta,
          ratingAfter: before + delta,
          matchesBefore: getC(id),
          playedAt: m.playedAt,
        });
        ratings.set(id, before + delta);
        matchCount.set(id, getC(id) + 1);
        wins.set(id, (wins.get(id) ?? 0) + (actual === 1 ? 1 : 0));
        losses.set(id, (losses.get(id) ?? 0) + (actual === 0 ? 1 : 0));
        lastChange.set(id, delta);
      }
    }
  }

  return { ratings, matches: matchCount, wins, losses, lastChange, history };
}

/** True once a player has reached PROVISIONAL_MATCHES rated matches in a category. */
export function isEstablished(matchesPlayed: number, cfg: EloConfig = ELO_CONFIG): boolean {
  return matchesPlayed >= cfg.PROVISIONAL_MATCHES;
}

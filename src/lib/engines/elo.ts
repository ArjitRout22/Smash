/**
 * Elo rating engine (pure, deterministic, no I/O).
 *
 * Every player starts at ELO_START. After each match the winner gains — and the
 * loser loses — points based on how *expected* the result was: beating a
 * higher-rated player earns more than beating a weaker one. This makes the rating
 * opponent-relative, unlike a flat win-count.
 *
 * Doubles: a side's rating is the average of its players' current ratings, and
 * the resulting delta is applied to each player on that side. Every match is
 * zero-sum (the winners' total gain equals the losers' total loss).
 */

/** Starting rating for an unrated player. */
export const ELO_START = 1000;
/** K-factor — the maximum single-match swing. 32 is the common club default. */
export const ELO_K = 32;

/** Probability that side A beats side B given their current ratings. */
export function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export type EloMatch = {
  /** Player ids on side A (one for singles, two for doubles). */
  sideA: string[];
  /** Player ids on side B. */
  sideB: string[];
  /** Which side won. */
  winner: "A" | "B";
};

const avg = (nums: number[]): number => nums.reduce((s, n) => s + n, 0) / nums.length;

/**
 * Replay matches IN CHRONOLOGICAL ORDER and return each player's final rating.
 * Players not seen in any match are absent from the map (treated as ELO_START by
 * callers). Elo is order-dependent, so the caller must pass matches sorted.
 */
export function replayElo(
  matches: EloMatch[],
  opts: { start?: number; k?: number; initial?: Map<string, number> } = {}
): Map<string, number> {
  const start = opts.start ?? ELO_START;
  const k = opts.k ?? ELO_K;
  // Seed with known current ratings (for an incremental single-match update);
  // any player absent from the seed is treated as `start`.
  const ratings = new Map<string, number>(opts.initial ?? []);
  const get = (id: string) => ratings.get(id) ?? start;

  for (const m of matches) {
    if (!m.sideA.length || !m.sideB.length) continue; // skip malformed rows
    const ratingA = avg(m.sideA.map(get));
    const ratingB = avg(m.sideB.map(get));
    const expectedA = eloExpected(ratingA, ratingB);
    const scoreA = m.winner === "A" ? 1 : 0;
    // Round once and mirror so a match never creates or destroys points.
    const deltaA = Math.round(k * (scoreA - expectedA));
    for (const id of m.sideA) ratings.set(id, get(id) + deltaA);
    for (const id of m.sideB) ratings.set(id, get(id) - deltaA);
  }
  return ratings;
}

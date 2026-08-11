/**
 * Leaderboard ranking — pure. Deterministic ordering + rank assignment used by
 * both the global player leaderboard and per-tournament standings.
 */

export type RankableStat = {
  id: string; // player or team id (stable tie-breaker of last resort)
  points: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  titles?: number;
};

export function winPercentage(wins: number, matchesPlayed: number): number {
  if (matchesPlayed <= 0) return 0;
  return Math.round((wins / matchesPlayed) * 10000) / 100; // 2 dp
}

/**
 * Deterministic comparator. Ordering priority:
 *   1. points (desc)
 *   2. wins (desc)
 *   3. win percentage (desc)
 *   4. fewer matches played (asc) — same record in fewer games ranks higher
 *   5. titles (desc)
 *   6. id (asc) — guarantees a total, stable order
 */
export function compareStats(a: RankableStat, b: RankableStat): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  const wpA = winPercentage(a.wins, a.matchesPlayed);
  const wpB = winPercentage(b.wins, b.matchesPlayed);
  if (wpB !== wpA) return wpB - wpA;
  if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
  if ((b.titles ?? 0) !== (a.titles ?? 0)) return (b.titles ?? 0) - (a.titles ?? 0);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type Ranked<T> = T & { rank: number; winPercentage: number };

/**
 * Sort entries and assign 1-based ranks. Entries that are exactly equal on all
 * ranking dimensions (ignoring the id tie-breaker) share a rank ("1224" style).
 */
export function assignRanks<T extends RankableStat>(entries: T[]): Ranked<T>[] {
  const sorted = [...entries].sort(compareStats);
  const out: Ranked<T>[] = [];
  let lastKey: string | null = null;
  let lastRank = 0;

  sorted.forEach((e, index) => {
    const key = `${e.points}|${e.wins}|${winPercentage(e.wins, e.matchesPlayed)}|${e.matchesPlayed}|${e.titles ?? 0}`;
    const rank = key === lastKey ? lastRank : index + 1;
    lastKey = key;
    lastRank = rank;
    out.push({ ...e, rank, winPercentage: winPercentage(e.wins, e.matchesPlayed) });
  });

  return out;
}

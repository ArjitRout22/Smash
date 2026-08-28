/**
 * Fixture scheduling — pure. Turns a set of entrants (or groups) into an ordered
 * list of matches using the round-robin **circle method**, so the schedule reads
 * like a real one: within a round every entrant plays at most once (nobody plays
 * two matches back-to-back while others wait), and a double round-robin plays its
 * second leg as a whole second cycle (rematches land in the second half, not
 * immediately after the first meeting).
 */

// A scheduled fixture: side-A id, side-B id, and (when round-structured) its
// 1-based round and 0-based court/slot. round/court are null for flat fallbacks.
export type PlannedMatch = { a: string; b: string; round: number | null; court: number | null };

const BYE = "__bye__";

/**
 * Circle-method rounds for ONE group. Returns an array of rounds; each round is a
 * list of [a,b] pairings in which every entrant appears at most once. Odd counts
 * get a bye each round (that entrant rests). Over the whole schedule every pair
 * meets exactly once.
 */
export function circleMethodRounds(ids: string[]): [string, string][][] {
  if (ids.length < 2) return [];
  // Pad odd counts with a bye so pairing is uniform; the bye's matches are dropped.
  let line = ids.length % 2 === 1 ? [...ids, BYE] : ids.slice();
  const n = line.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = line[i];
      const b = line[n - 1 - i];
      if (a !== BYE && b !== BYE) round.push([a, b]);
    }
    rounds.push(round);
    // Rotate: keep the first entrant fixed, rotate the rest clockwise by one.
    line = [line[0], line[n - 1], ...line.slice(1, n - 1)];
  }
  return rounds;
}

/** Everyone-plays-everyone within a single pool, in proper round order. */
export function roundRobinSchedule(ids: string[], meetings: number): PlannedMatch[] {
  return interleaveGroups([circleMethodRounds(ids)], meetings);
}

/**
 * Internal round-robin within EACH group (group_stage: top N of each advance
 * later). Rounds are interleaved across groups — round 1 of every group, then
 * round 2 of every group, … — so courts fill up and no single group's teams play
 * back-to-back while the rest wait.
 */
export function groupStageSchedule(groups: string[][], meetings: number): PlannedMatch[] {
  return interleaveGroups(groups.map((g) => circleMethodRounds(g)), meetings);
}

/**
 * Flatten per-group rounds into an ordered fixture list. For each meeting (a full
 * cycle) we walk round-by-round across all groups; the second cycle swaps
 * home/away so a double round-robin isn't a literal repeat.
 */
function interleaveGroups(perGroupRounds: [string, string][][][], meetings: number): PlannedMatch[] {
  const maxRounds = Math.max(0, ...perGroupRounds.map((r) => r.length));
  const planned: PlannedMatch[] = [];
  let roundNo = 0;
  for (let meeting = 0; meeting < meetings; meeting++) {
    for (let r = 0; r < maxRounds; r++) {
      roundNo += 1;
      let court = 0;
      for (const rounds of perGroupRounds) {
        const round = rounds[r];
        if (!round) continue;
        for (const [a, b] of round) {
          const [x, y] = meeting % 2 === 0 ? [a, b] : [b, a];
          planned.push({ a: x, b: y, round: roundNo, court: court++ });
        }
      }
    }
  }
  return planned;
}

function crossGroupPairs(groups: string[][]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      for (const a of groups[i]) for (const b of groups[j]) pairs.push([a, b]);
  return pairs;
}

/**
 * Cross-group schedule (groups play each OTHER, not among themselves). For exactly
 * two EQUAL-size groups this uses the circle method (every A meets every B once per
 * cycle, one match per team per round, courts rotate). Any other shape falls back
 * to flat cross-group pairing.
 */
export function crossGroupSchedule(groups: string[][], meetings: number): PlannedMatch[] {
  const planned: PlannedMatch[] = [];
  const twoEqual = groups.length === 2 && groups[0].length === groups[1].length && groups[0].length > 0;
  if (twoEqual) {
    const [A, B] = groups;
    const n = A.length;
    let round = 0;
    for (let meeting = 0; meeting < meetings; meeting++) {
      for (let k = 0; k < n; k++) {
        const offset = (k + meeting) % n;
        round += 1;
        for (let i = 0; i < n; i++) {
          const court = (i + (round - 1)) % n;
          planned.push({ a: A[i], b: B[(i + offset) % n], round, court });
        }
      }
    }
    return planned;
  }
  for (const [a, b] of crossGroupPairs(groups)) {
    for (let r = 0; r < meetings; r++) {
      const [x, y] = r % 2 === 0 ? [a, b] : [b, a];
      planned.push({ a: x, b: y, round: null, court: null });
    }
  }
  return planned;
}

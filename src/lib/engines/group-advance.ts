/**
 * Group-stage → knockout advancement — pure. Given the groups and their played
 * match results, ranks each group and returns the top-K qualifiers ordered for
 * bracket seeding (winners first, so they get the top seeds / byes).
 *
 * Ranking within a group: wins → game difference → point difference → stable id.
 * (No head-to-head / mini-league tiebreak in v1.)
 */

export interface GroupInput {
  label: string;
  /** All entrants (player or team ids) assigned to this group. */
  entrantIds: string[];
}

export interface GroupMatchResult {
  aId: string;
  bId: string;
  /** Games won by each side. */
  aGames: number;
  bGames: number;
  /** Total points scored by each side across the games (for point-difference). */
  aPoints: number;
  bPoints: number;
}

export interface RankedEntrant {
  id: string;
  wins: number;
  losses: number;
  gameDiff: number;
  pointDiff: number;
  /** 0-based finishing position in the group (0 = group winner). */
  placement: number;
  qualified: boolean;
}

export interface AdvancementPlan {
  /** Qualifier ids ordered for seeding: all group winners first, then runners-up, … */
  ordered: string[];
  /** Per-group full ranking (for auditing / display). */
  groups: { label: string; ranked: RankedEntrant[] }[];
}

interface Tally {
  id: string;
  wins: number;
  losses: number;
  gameDiff: number;
  pointDiff: number;
}

function compareTally(a: Tally, b: Tally): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable, total order
}

/**
 * @param qualifiersPerGroup how many advance from each group (clamped to group size).
 */
export function selectQualifiers(
  groups: GroupInput[],
  results: GroupMatchResult[],
  qualifiersPerGroup: number
): AdvancementPlan {
  const k = Math.max(1, Math.floor(qualifiersPerGroup));

  const rankedByGroup = groups.map((g) => {
    const members = new Set(g.entrantIds);
    const tally = new Map<string, Tally>(
      g.entrantIds.map((id) => [id, { id, wins: 0, losses: 0, gameDiff: 0, pointDiff: 0 }])
    );
    for (const r of results) {
      // Only count matches internal to this group.
      if (!members.has(r.aId) || !members.has(r.bId)) continue;
      const a = tally.get(r.aId)!;
      const b = tally.get(r.bId)!;
      a.gameDiff += r.aGames - r.bGames;
      b.gameDiff += r.bGames - r.aGames;
      a.pointDiff += r.aPoints - r.bPoints;
      b.pointDiff += r.bPoints - r.aPoints;
      if (r.aGames > r.bGames) { a.wins++; b.losses++; }
      else if (r.bGames > r.aGames) { b.wins++; a.losses++; }
    }
    const sorted = [...tally.values()].sort(compareTally);
    const take = Math.min(k, sorted.length);
    const ranked: RankedEntrant[] = sorted.map((t, i) => ({
      id: t.id,
      wins: t.wins,
      losses: t.losses,
      gameDiff: t.gameDiff,
      pointDiff: t.pointDiff,
      placement: i,
      qualified: i < take,
    }));
    return { label: g.label, ranked };
  });

  // Seed order: bucket by placement (all winners, then all runners-up, …); within
  // a bucket, strongest record first. Winners land on the top seeds and get byes.
  const maxPlacement = Math.max(0, ...rankedByGroup.map((g) => g.ranked.length));
  const ordered: string[] = [];
  for (let place = 0; place < maxPlacement; place++) {
    const bucket = rankedByGroup
      .map((g) => g.ranked.find((r) => r.placement === place && r.qualified))
      .filter((r): r is RankedEntrant => r != null)
      .sort((a, b) =>
        compareTally(
          { id: a.id, wins: a.wins, losses: a.losses, gameDiff: a.gameDiff, pointDiff: a.pointDiff },
          { id: b.id, wins: b.wins, losses: b.losses, gameDiff: b.gameDiff, pointDiff: b.pointDiff }
        )
      );
    for (const r of bucket) ordered.push(r.id);
  }

  return { ordered, groups: rankedByGroup };
}

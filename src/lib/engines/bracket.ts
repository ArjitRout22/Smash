import type { Side } from "@/lib/domain/constants";

/**
 * Single-elimination bracket engine — pure. Handles seeding, feeder-link
 * computation (which match a winner advances into), and building a rounds
 * structure for visualization.
 */

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Standard tournament seeding order for a bracket of `size` (a power of two).
 * Returns seed numbers (1-based) in slot order, so top seeds are kept apart
 * (seed 1 & 2 only meet in the final, 1 plays the lowest seed first).
 * e.g. size 4 → [1,4,2,3]; size 8 → [1,8,4,5,2,7,3,6].
 */
export function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

/** Which (round, slot, side) a winner of (round, slot) advances into. */
export function nextMatchCoords(
  round: number,
  slot: number
): { round: number; slot: number; side: Side } {
  return {
    round: round + 1,
    slot: Math.floor(slot / 2),
    side: slot % 2 === 0 ? "A" : "B",
  };
}

export type PlannedSlot =
  | { kind: "participant"; ref: string }
  | { kind: "bye" }
  | { kind: "winner"; fromRound: number; fromSlot: number };

export type PlannedMatch = {
  round: number; // 1 = first round
  slot: number; // 0-based within the round
  sideA: PlannedSlot;
  sideB: PlannedSlot;
  // Where this match's winner goes (undefined for the final).
  next?: { round: number; slot: number; side: Side };
};

/**
 * Produce a full single-elimination plan for the given participant ids
 * (already ordered by seed: index 0 = top seed). Uneven counts get byes.
 */
export function generateSingleEliminationPlan(participantIds: string[]): {
  rounds: number;
  matches: PlannedMatch[];
} {
  const n = participantIds.length;
  const size = nextPowerOfTwo(n);
  const totalRounds = Math.max(1, Math.log2(size));
  const order = seedOrder(size); // seed number per bracket position

  const matches: PlannedMatch[] = [];

  // Round 1
  const firstRoundMatches = size / 2;
  for (let slot = 0; slot < firstRoundMatches; slot++) {
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    const idA = participantIds[seedA - 1];
    const idB = participantIds[seedB - 1];
    matches.push({
      round: 1,
      slot,
      sideA: idA ? { kind: "participant", ref: idA } : { kind: "bye" },
      sideB: idB ? { kind: "participant", ref: idB } : { kind: "bye" },
      next: totalRounds > 1 ? nextMatchCoords(1, slot) : undefined,
    });
  }

  // Subsequent rounds are filled by winners of the previous round.
  let matchesInRound = firstRoundMatches / 2;
  for (let round = 2; round <= totalRounds; round++) {
    for (let slot = 0; slot < matchesInRound; slot++) {
      matches.push({
        round,
        slot,
        sideA: { kind: "winner", fromRound: round - 1, fromSlot: slot * 2 },
        sideB: { kind: "winner", fromRound: round - 1, fromSlot: slot * 2 + 1 },
        next: round < totalRounds ? nextMatchCoords(round, slot) : undefined,
      });
    }
    matchesInRound /= 2;
  }

  return { rounds: totalRounds, matches };
}

// --- Visualization ----------------------------------------------------------

export type BracketMatchView = {
  id: string;
  round: number;
  slot: number;
  status: string;
  sideA: { label: string; score: number | null; isWinner: boolean } | null;
  sideB: { label: string; score: number | null; isWinner: boolean } | null;
};

export type BracketMatchInput = {
  id: string;
  round: number | null;
  slot: number | null;
  status: string;
  winnerSide: string | null;
  participants: {
    side: string;
    label: string;
    gamesWon: number;
  }[];
};

/** Group matches into ordered rounds for rendering a knockout bracket. */
export function buildBracket(matches: BracketMatchInput[]): {
  round: number;
  matches: BracketMatchView[];
}[] {
  const withRound = matches.filter((m) => m.round != null);
  const byRound = new Map<number, BracketMatchView[]>();

  for (const m of withRound) {
    const round = m.round as number;
    const a = m.participants.find((p) => p.side === "A");
    const b = m.participants.find((p) => p.side === "B");
    const view: BracketMatchView = {
      id: m.id,
      round,
      slot: m.slot ?? 0,
      status: m.status,
      sideA: a
        ? { label: a.label, score: a.gamesWon, isWinner: m.winnerSide === "A" }
        : null,
      sideB: b
        ? { label: b.label, score: b.gamesWon, isWinner: m.winnerSide === "B" }
        : null,
    };
    const arr = byRound.get(round) ?? [];
    arr.push(view);
    byRound.set(round, arr);
  }

  return [...byRound.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([round, ms]) => ({
      round,
      matches: ms.sort((x, y) => x.slot - y.slot),
    }));
}

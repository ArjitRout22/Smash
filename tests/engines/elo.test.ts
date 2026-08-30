import { describe, it, expect } from "vitest";
import { eloExpected, eloDelta, replayElo, ELO_CONFIG, type EloMatchInput } from "@/lib/engines/elo";

const K = ELO_CONFIG.PROVISIONAL_K; // 32
const EK = ELO_CONFIG.ESTABLISHED_K; // 24
const m = (matchId: string, a: string[], b: string[], winner: "A" | "B", playedAt: string): EloMatchInput => ({ matchId, sideA: a, sideB: b, winner, playedAt });

describe("elo formula (spec tests)", () => {
  it("expected score is symmetric and sums to 1", () => {
    expect(eloExpected(1000, 1000)).toBeCloseTo(0.5, 10);
    expect(eloExpected(1200, 1000) + eloExpected(1000, 1200)).toBeCloseTo(1, 10);
  });

  // Spec Test 1: both 1000, A wins, K=32 → A 1016 / B 984.
  it("Test 1: equal ratings, A wins, K=32 → +16 / -16", () => {
    const d = eloDelta(1000, 1000, "A", K);
    expect(1000 + d).toBe(1016);
    expect(1000 - d).toBe(984);
  });

  // Spec Test 2: A stronger (1200 vs 1000) wins → gains FEWER than an even win.
  it("Test 2: the stronger player gains fewer points", () => {
    const stronger = eloDelta(1200, 1000, "A", K);
    const even = eloDelta(1000, 1000, "A", K);
    expect(stronger).toBeGreaterThan(0);
    expect(stronger).toBeLessThan(even);
  });

  // Spec Test 3: A weaker (1000 vs 1200) wins the upset → gains MORE.
  it("Test 3: the upset winner gains more points", () => {
    const upset = eloDelta(1000, 1200, "A", K);
    const even = eloDelta(1000, 1000, "A", K);
    expect(upset).toBeGreaterThan(even);
  });

  // Spec Test 4: equal ratings, A LOSES, K=32 → A -16, B +16.
  it("Test 4: equal ratings, A loses → -16 / +16", () => {
    const d = eloDelta(1000, 1000, "B", K); // change for A when B wins
    expect(d).toBe(-16);
    expect(1000 + d).toBe(984);
    expect(1000 - d).toBe(1016);
  });
});

describe("replayElo — sequencing, zero-sum, provisional, history", () => {
  it("uses ratings BEFORE each match, carried forward sequentially", () => {
    const r = replayElo([
      m("m1", ["a"], ["b"], "A", "2026-01-01"),
      m("m2", ["a"], ["c"], "A", "2026-01-02"),
    ]);
    // m1: a beats b at 1000 → a 1016. m2: a (1016) beats c (1000) → a gains < 16.
    const hist2 = r.history.find((h) => h.matchId === "m2" && h.playerId === "a")!;
    expect(hist2.ratingBefore).toBe(1016); // not the starting 1000
    expect(hist2.ratingChange).toBeLessThan(16);
  });

  it("every match is zero-sum (winner gain == loser loss)", () => {
    const r = replayElo([m("m1", ["a"], ["b"], "A", "2026-01-01")]);
    const a = r.history.find((h) => h.playerId === "a")!;
    const b = r.history.find((h) => h.playerId === "b")!;
    expect(a.ratingChange + b.ratingChange).toBe(0);
  });

  it("drops K from 32 to 24 once BOTH players are established (after 5 matches)", () => {
    // a and b play each other 6 times (a always wins). Match #6 is the first with
    // both players established (each has 5 prior matches) → K should be 24.
    const matches = Array.from({ length: 6 }, (_, i) => m(`g${i}`, ["a"], ["b"], "A", `2026-02-0${i + 1}`));
    const r = replayElo(matches);
    const g6 = r.history.find((h) => h.matchId === "g5" && h.playerId === "a")!; // 6th match (index 5)
    expect(g6.matchesBefore).toBe(5);
    expect(g6.k).toBe(EK);
    // an earlier match (both still provisional) used K=32
    const g1 = r.history.find((h) => h.matchId === "g0" && h.playerId === "a")!;
    expect(g1.k).toBe(K);
  });

  it("doubles: both teammates get the same change, and it's zero-sum across teams", () => {
    const r = replayElo([m("d1", ["a1", "a2"], ["b1", "b2"], "A", "2026-03-01")]);
    const a1 = r.history.find((h) => h.playerId === "a1")!;
    const a2 = r.history.find((h) => h.playerId === "a2")!;
    const b1 = r.history.find((h) => h.playerId === "b1")!;
    expect(a1.ratingChange).toBe(a2.ratingChange);
    expect(a1.ratingChange).toBeGreaterThan(0);
    expect(b1.ratingChange).toBe(-a1.ratingChange);
    // team totals cancel
    const total = r.history.reduce((s, h) => s + h.ratingChange, 0);
    expect(total).toBe(0);
  });

  it("records a full history row per player per match", () => {
    const r = replayElo([m("m1", ["a"], ["b"], "A", "2026-01-01")]);
    expect(r.history).toHaveLength(2);
    const a = r.history.find((h) => h.playerId === "a")!;
    expect(a).toMatchObject({ matchId: "m1", side: "A", actualScore: 1, ratingBefore: 1000, ratingAfter: 1016, k: K });
    expect(a.opponentIds).toEqual(["b"]);
    expect(a.expectedScore).toBeCloseTo(0.5, 10);
  });
});

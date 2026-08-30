import { describe, it, expect } from "vitest";
import { eloExpected, replayElo, ELO_START, ELO_K } from "@/lib/engines/elo";

describe("elo engine", () => {
  it("equal ratings are a coin flip (expected 0.5)", () => {
    expect(eloExpected(1000, 1000)).toBeCloseTo(0.5, 10);
  });

  it("a higher rating has a higher expected score, and the two sides sum to 1", () => {
    const a = eloExpected(1200, 1000);
    const b = eloExpected(1000, 1200);
    expect(a).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
    expect(a + b).toBeCloseTo(1, 10);
  });

  it("winner gains and loser loses the same amount (zero-sum) from equal ratings", () => {
    const r = replayElo([{ sideA: ["a"], sideB: ["b"], winner: "A" }]);
    // From 1000 vs 1000, expected 0.5 → delta = round(32 * 0.5) = 16.
    expect(r.get("a")).toBe(ELO_START + ELO_K / 2);
    expect(r.get("b")).toBe(ELO_START - ELO_K / 2);
    expect(r.get("a")! - ELO_START).toBe(ELO_START - r.get("b")!); // mirror image
  });

  it("beating a STRONGER player earns more than beating an equal one", () => {
    // "high" wins three matches first, climbing above 1000.
    const seeded = replayElo([
      { sideA: ["high"], sideB: ["f1"], winner: "A" },
      { sideA: ["high"], sideB: ["f2"], winner: "A" },
      { sideA: ["high"], sideB: ["f3"], winner: "A" },
      { sideA: ["low"], sideB: ["high"], winner: "A" }, // low (1000) upsets the higher-rated high
    ]);
    const upsetGain = seeded.get("low")! - ELO_START;
    const evenGain = replayElo([{ sideA: ["x"], sideB: ["y"], winner: "A" }]).get("x")! - ELO_START;
    expect(evenGain).toBe(ELO_K / 2); // 16
    expect(upsetGain).toBeGreaterThan(evenGain);
  });

  it("unseen players are absent from the map (callers treat them as ELO_START)", () => {
    const r = replayElo([{ sideA: ["a"], sideB: ["b"], winner: "A" }]);
    expect(r.has("someone-who-never-played")).toBe(false);
  });

  it("doubles: both players on a side get the same delta", () => {
    const r = replayElo([{ sideA: ["a1", "a2"], sideB: ["b1", "b2"], winner: "A" }]);
    expect(r.get("a1")).toBe(r.get("a2"));
    expect(r.get("b1")).toBe(r.get("b2"));
    expect(r.get("a1")).toBeGreaterThan(ELO_START);
    expect(r.get("b1")).toBeLessThan(ELO_START);
  });

  it("is order-dependent (an opponent's strength when faced changes the result)", () => {
    // seq1: b beats c FIRST (b climbs), then a beats the now-stronger b → a gains more.
    const seq1 = replayElo([
      { sideA: ["b"], sideB: ["c"], winner: "A" },
      { sideA: ["a"], sideB: ["b"], winner: "A" },
    ]);
    // seq2: a beats b while b is still 1000 → a gains the base amount.
    const seq2 = replayElo([
      { sideA: ["a"], sideB: ["b"], winner: "A" },
      { sideA: ["b"], sideB: ["c"], winner: "A" },
    ]);
    expect(seq1.get("a")!).toBeGreaterThan(seq2.get("a")!);
  });

  it("skips malformed matches (a side with no players)", () => {
    const r = replayElo([{ sideA: [], sideB: ["b"], winner: "B" }]);
    expect(r.size).toBe(0);
  });
});

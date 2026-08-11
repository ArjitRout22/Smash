import { describe, it, expect } from "vitest";
import {
  winPercentage,
  compareStats,
  assignRanks,
} from "@/lib/engines/leaderboard";

describe("leaderboard engine", () => {
  it("computes win percentage to 2dp", () => {
    expect(winPercentage(34, 48)).toBe(70.83);
    expect(winPercentage(0, 0)).toBe(0);
    expect(winPercentage(1, 3)).toBe(33.33);
  });

  it("orders by points, then wins, then win%", () => {
    const a = { id: "a", points: 100, wins: 10, losses: 2, matchesPlayed: 12 };
    const b = { id: "b", points: 100, wins: 8, losses: 4, matchesPlayed: 12 };
    expect(compareStats(a, b)).toBeLessThan(0); // a ahead (more wins)
  });

  it("breaks equal records by fewer matches played", () => {
    const a = { id: "a", points: 50, wins: 5, losses: 0, matchesPlayed: 5 };
    const b = { id: "b", points: 50, wins: 5, losses: 2, matchesPlayed: 7 };
    // same points & wins; a has higher win% AND fewer matches → ahead
    expect(compareStats(a, b)).toBeLessThan(0);
  });

  it("is deterministic via id tie-breaker", () => {
    const a = { id: "aaa", points: 10, wins: 1, losses: 1, matchesPlayed: 2 };
    const b = { id: "bbb", points: 10, wins: 1, losses: 1, matchesPlayed: 2 };
    expect(compareStats(a, b)).toBeLessThan(0);
    expect(compareStats(b, a)).toBeGreaterThan(0);
  });

  it("assigns 1-based ranks and shares rank for identical records", () => {
    const ranked = assignRanks([
      { id: "x", points: 30, wins: 3, losses: 0, matchesPlayed: 3 },
      { id: "y", points: 20, wins: 2, losses: 1, matchesPlayed: 3 },
      { id: "z", points: 20, wins: 2, losses: 1, matchesPlayed: 3 },
    ]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(2); // tie shares rank
    expect(ranked[0].winPercentage).toBe(100);
  });
});

import { describe, it, expect } from "vitest";
import {
  circleMethodRounds,
  roundRobinSchedule,
  groupStageSchedule,
  type PlannedMatch,
} from "@/lib/engines/schedule";

const key = (a: string, b: string) => [a, b].sort().join("~");
const ids = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)); // A,B,C,…

/** Longest run of consecutive matches that share a common entrant. */
function maxConsecutiveForAnyEntrant(ms: PlannedMatch[]): number {
  let max = 0;
  const players = [...new Set(ms.flatMap((m) => [m.a, m.b]))];
  for (const p of players) {
    let run = 0;
    for (const m of ms) {
      if (m.a === p || m.b === p) run += 1;
      else run = 0;
      max = Math.max(max, run);
    }
  }
  return max;
}

describe("circleMethodRounds", () => {
  it("even pool: n-1 rounds, every pair once, no entrant twice in a round", () => {
    const rounds = circleMethodRounds(ids(4));
    expect(rounds.length).toBe(3);
    rounds.forEach((r) => expect(r.length).toBe(2)); // 2 matches per round
    const seen = rounds.flat().map(([a, b]) => key(a, b));
    expect(new Set(seen).size).toBe(6); // C(4,2)
    rounds.forEach((r) => {
      const inRound = r.flat();
      expect(new Set(inRound).size).toBe(inRound.length); // each team at most once
    });
  });

  it("odd pool: everyone rests once, every pair meets once", () => {
    const rounds = circleMethodRounds(ids(3));
    expect(rounds.length).toBe(3);
    rounds.forEach((r) => expect(r.length).toBe(1)); // one match, one team rests
    expect(new Set(rounds.flat().map(([a, b]) => key(a, b))).size).toBe(3);
  });
});

describe("roundRobinSchedule / groupStageSchedule ordering", () => {
  it("never schedules an immediate rematch (the reported 1v2 → 2v1 bug)", () => {
    const ms = groupStageSchedule([ids(3)], 2); // 3 teams, double round-robin
    expect(ms.length).toBe(6);
    for (let i = 1; i < ms.length; i++) {
      expect(key(ms[i].a, ms[i].b)).not.toBe(key(ms[i - 1].a, ms[i - 1].b));
    }
    // no team plays more than 2 matches in a row (the "others waiting" complaint)
    expect(maxConsecutiveForAnyEntrant(ms)).toBeLessThanOrEqual(2);
  });

  it("covers every pairing exactly `meetings` times", () => {
    const ms = roundRobinSchedule(ids(5), 2);
    const counts = new Map<string, number>();
    for (const m of ms) counts.set(key(m.a, m.b), (counts.get(key(m.a, m.b)) ?? 0) + 1);
    expect(ms.length).toBe(5 * 4); // C(5,2)*2 = 20
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
    expect(counts.size).toBe(10);
  });

  it("within any round no team appears twice", () => {
    const ms = roundRobinSchedule(ids(6), 1);
    const byRound = new Map<number, string[]>();
    for (const m of ms) {
      const arr = byRound.get(m.round!) ?? [];
      arr.push(m.a, m.b);
      byRound.set(m.round!, arr);
    }
    for (const teams of byRound.values()) expect(new Set(teams).size).toBe(teams.length);
  });

  it("interleaves groups: round 1 contains matches from every group", () => {
    const A = ["a1", "a2", "a3"];
    const B = ["b1", "b2", "b3"];
    const ms = groupStageSchedule([A, B], 1);
    const round1 = ms.filter((m) => m.round === 1);
    const hasA = round1.some((m) => A.includes(m.a) || A.includes(m.b));
    const hasB = round1.some((m) => B.includes(m.a) || B.includes(m.b));
    expect(hasA && hasB).toBe(true);
    // groups never play each other
    for (const m of ms) {
      const sameGroup = (A.includes(m.a) && A.includes(m.b)) || (B.includes(m.a) && B.includes(m.b));
      expect(sameGroup).toBe(true);
    }
  });
});

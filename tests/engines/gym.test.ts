import { describe, it, expect } from "vitest";
import { computeGymStats, computeBadges, compareConsistency, addDays, daysBetween, dayKey } from "@/lib/engines/gym";

const TODAY = "2026-08-30";

describe("gym date helpers", () => {
  it("addDays / daysBetween / dayKey are consistent", () => {
    expect(addDays(TODAY, -1)).toBe("2026-08-29");
    expect(addDays(TODAY, 1)).toBe("2026-08-31");
    expect(daysBetween("2026-08-30", "2026-08-27")).toBe(3);
    expect(dayKey(new Date("2026-08-30T15:00:00Z"))).toBe("2026-08-30");
  });
});

describe("computeGymStats", () => {
  it("counts a current streak ending today", () => {
    const days = ["2026-08-30", "2026-08-29", "2026-08-28"];
    const s = computeGymStats(days, TODAY);
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
    expect(s.totalDays).toBe(3);
  });

  it("keeps the streak alive if today isn't logged yet but yesterday is", () => {
    const s = computeGymStats(["2026-08-29", "2026-08-28"], TODAY);
    expect(s.currentStreak).toBe(2);
  });

  it("breaks the streak once a full day is missed", () => {
    // Missing 2026-08-29 → current streak is 0 (last active was two days ago).
    const s = computeGymStats(["2026-08-28", "2026-08-27"], TODAY);
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(2);
  });

  it("dedupes multiple workouts on the same day", () => {
    const s = computeGymStats(["2026-08-30", "2026-08-30", "2026-08-29"], TODAY);
    expect(s.totalDays).toBe(2);
    expect(s.currentStreak).toBe(2);
  });

  it("computes this-week, last-30, and the consistency score", () => {
    const days = [TODAY, addDays(TODAY, -3), addDays(TODAY, -6), addDays(TODAY, -20), addDays(TODAY, -40)];
    const s = computeGymStats(days, TODAY);
    expect(s.sessionsThisWeek).toBe(3); // today, -3, -6
    expect(s.sessionsLast30).toBe(4); // excludes -40
    // current streak = 1 (only today; -3 breaks it), score = 1*10 + 4 = 14
    expect(s.currentStreak).toBe(1);
    expect(s.consistencyScore).toBe(14);
  });

  it("finds the longest historical run even when not current", () => {
    const days = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-08-30"];
    const s = computeGymStats(days, TODAY);
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(1);
  });
});

describe("computeBadges", () => {
  it("awards milestones as thresholds are crossed", () => {
    const none = computeBadges({ totalDays: 0, longestStreak: 0, totalDistanceKm: 0, hasIncline: false });
    expect(none).toEqual([]);
    const some = computeBadges({ totalDays: 30, longestStreak: 7, totalDistanceKm: 55, hasIncline: true });
    const keys = some.map((b) => b.key);
    expect(keys).toContain("first");
    expect(keys).toContain("streak7");
    expect(keys).toContain("days30");
    expect(keys).toContain("incline");
    expect(keys).toContain("km50");
    expect(keys).not.toContain("km100");
    expect(keys).not.toContain("streak30");
  });
});

describe("compareConsistency", () => {
  it("ranks by score, then streak, then active days", () => {
    const a = { consistencyScore: 20, currentStreak: 2, totalDays: 10 };
    const b = { consistencyScore: 14, currentStreak: 4, totalDays: 4 };
    const c = { consistencyScore: 20, currentStreak: 5, totalDays: 8 };
    const sorted = [a, b, c].sort(compareConsistency);
    expect(sorted[0]).toBe(c); // same score as a, higher streak
    expect(sorted[1]).toBe(a);
    expect(sorted[2]).toBe(b);
  });
});

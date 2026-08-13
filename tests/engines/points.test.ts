import { describe, it, expect } from "vitest";
import {
  DEFAULT_POINTS_CONFIG,
  STANDARD_POINTS_CONFIG,
  LEAGUE_POINTS_CONFIG,
  resolvePointsConfig,
  pointsForMatch,
  pointsSystemOf,
  sumAwards,
  globalRankingPoints,
} from "@/lib/engines/points";

describe("points engine", () => {
  it("winner of a plain match gets matchWin only", () => {
    const awards = pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true });
    expect(sumAwards(awards)).toBe(10);
    expect(awards.map((a) => a.type)).toEqual(["match_win"]);
  });

  it("loser gets matchLoss", () => {
    const awards = pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: false });
    expect(sumAwards(awards)).toBe(2);
    expect(awards[0].type).toBe("match_loss");
  });

  it("stacks stage bonus for the winner (final = 10 + 50)", () => {
    const awards = pointsForMatch({
      config: DEFAULT_POINTS_CONFIG,
      isWinner: true,
      stageType: "final",
    });
    expect(sumAwards(awards)).toBe(60);
    expect(awards.map((a) => a.type)).toEqual(["match_win", "stage_win"]);
  });

  it("no stage bonus for the loser even in a bonus stage", () => {
    const awards = pointsForMatch({
      config: DEFAULT_POINTS_CONFIG,
      isWinner: false,
      stageType: "final",
    });
    expect(sumAwards(awards)).toBe(2);
  });

  it("merges a partial tournament override with defaults", () => {
    const cfg = resolvePointsConfig({ matchWin: 15, stageWinBonus: { final: 100 } });
    expect(cfg.matchWin).toBe(15);
    expect(cfg.matchLoss).toBe(DEFAULT_POINTS_CONFIG.matchLoss);
    expect(cfg.stageWinBonus.final).toBe(100);
    expect(cfg.stageWinBonus.quarterfinal).toBe(20); // default preserved
  });

  it("falls back to defaults on invalid override", () => {
    expect(resolvePointsConfig({ matchWin: -5 })).toEqual(DEFAULT_POINTS_CONFIG);
    expect(resolvePointsConfig(null)).toEqual(DEFAULT_POINTS_CONFIG);
  });

  describe("league (Sunday) scoring", () => {
    const cfg = LEAGUE_POINTS_CONFIG;

    it("default fallback is the Standard system, not League", () => {
      expect(DEFAULT_POINTS_CONFIG).toBe(STANDARD_POINTS_CONFIG);
      expect(pointsSystemOf(STANDARD_POINTS_CONFIG)).toBe("standard");
      expect(pointsSystemOf(LEAGUE_POINTS_CONFIG)).toBe("league");
    });

    it("winner gets 3 points, no stage bonus even in the final", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: true }))).toBe(3);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: true, stageType: "final" }))).toBe(3);
    });

    it("loser who reaches the 15-point floor gets 1", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 15 }))).toBe(1);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 19 }))).toBe(1);
    });

    it("loser below the floor gets 0", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 14 }))).toBe(0);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 0 }))).toBe(0);
    });

    it("without a side score, a league loss earns the base (0)", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false }))).toBe(0);
    });

    it("resolves a stored league config back to the league system (no bonus creep)", () => {
      const resolved = resolvePointsConfig(LEAGUE_POINTS_CONFIG);
      expect(pointsSystemOf(resolved)).toBe("league");
      expect(Object.values(resolved.stageWinBonus).every((v) => (v ?? 0) === 0)).toBe(true);
    });
  });

  describe("global ranking points (International: win 10 / loss 2)", () => {
    it("counts wins and losses, no stage bonuses", () => {
      expect(globalRankingPoints(0, 0)).toBe(0);
      expect(globalRankingPoints(1, 0)).toBe(10);
      expect(globalRankingPoints(0, 5)).toBe(10); // 5 losses = one win's worth
      expect(globalRankingPoints(3, 2)).toBe(34); // 30 + 4
    });

    it("matches the International (Standard) preset's match points", () => {
      expect(globalRankingPoints(1, 1)).toBe(STANDARD_POINTS_CONFIG.matchWin + STANDARD_POINTS_CONFIG.matchLoss);
    });
  });
});

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

  describe("league scoring (default: flat win 2 / loss 0)", () => {
    const cfg = LEAGUE_POINTS_CONFIG;

    it("default fallback is the Standard system, not League", () => {
      expect(DEFAULT_POINTS_CONFIG).toBe(STANDARD_POINTS_CONFIG);
      expect(pointsSystemOf(STANDARD_POINTS_CONFIG)).toBe("standard");
      expect(pointsSystemOf(LEAGUE_POINTS_CONFIG)).toBe("league");
    });

    it("winner gets 2 points, no stage bonus even in the final", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: true }))).toBe(2);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: true, stageType: "final" }))).toBe(2);
    });

    it("loser gets 0 by default — no consolation floor regardless of score", () => {
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false }))).toBe(0);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 20 }))).toBe(0);
      expect(sumAwards(pointsForMatch({ config: cfg, isWinner: false, sideScore: 0 }))).toBe(0);
    });

    it("honours CUSTOM league point values (configurable win/loss)", () => {
      const custom = resolvePointsConfig({ system: "league", matchWin: 5, matchLoss: 1 });
      expect(pointsSystemOf(custom)).toBe("league");
      expect(sumAwards(pointsForMatch({ config: custom, isWinner: true }))).toBe(5);
      expect(sumAwards(pointsForMatch({ config: custom, isWinner: false }))).toBe(1);
    });

    it("honours an OPTIONAL close-loss bonus when the organizer enables one", () => {
      const withFloor = resolvePointsConfig({
        system: "league",
        matchWin: 2,
        matchLoss: 0,
        lossBonusThreshold: 15,
        lossBonusPoints: 1,
      });
      expect(sumAwards(pointsForMatch({ config: withFloor, isWinner: false, sideScore: 15 }))).toBe(1);
      expect(sumAwards(pointsForMatch({ config: withFloor, isWinner: false, sideScore: 14 }))).toBe(0);
    });

    it("resolves a stored league config back to the league system (no bonus creep)", () => {
      const resolved = resolvePointsConfig(LEAGUE_POINTS_CONFIG);
      expect(pointsSystemOf(resolved)).toBe("league");
      expect(Object.values(resolved.stageWinBonus).every((v) => (v ?? 0) === 0)).toBe(true);
    });

    it("classifies a LEGACY league config (floor, no explicit system) as league", () => {
      // Pre-`system` rows carried a floor to mark themselves League.
      const legacy = resolvePointsConfig({ matchWin: 3, matchLoss: 0, lossBonusThreshold: 15, lossBonusPoints: 1 });
      expect(pointsSystemOf(legacy)).toBe("league");
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

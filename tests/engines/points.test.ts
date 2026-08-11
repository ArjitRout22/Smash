import { describe, it, expect } from "vitest";
import {
  DEFAULT_POINTS_CONFIG,
  resolvePointsConfig,
  pointsForMatch,
  sumAwards,
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
});

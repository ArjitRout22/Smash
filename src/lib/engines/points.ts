import { z } from "zod";
import type { PointTxType, StageType } from "@/lib/domain/constants";

/**
 * Configurable points system — pure. A tournament stores its choice in the
 * `pointsConfig` JSON; the two shipped systems are STANDARD and LEAGUE (below).
 * Point transactions (not totals) are the source of truth for the GLOBAL
 * player ledger, so changing the config only affects future awards there — but
 * the per-tournament standings are recomputed from stored match results, so
 * they always reflect the tournament's CURRENT config.
 */
export type PointsConfig = {
  matchWin: number;
  /** Points for a loss (a loss BELOW the league floor, when a floor is set). */
  matchLoss: number;
  participation: number;
  /** Bonus awarded to the winner of a match, by the stage it was played in. */
  stageWinBonus: Partial<Record<StageType, number>>;
  /** Bonus for winning the tournament (title). */
  title: number;
  /**
   * "League" consolation floor. When set, a LOSER whose match score reaches
   * `lossBonusThreshold` earns `lossBonusPoints` instead of `matchLoss`.
   * Both null = classic flat win/loss scoring (no score-based consolation).
   */
  lossBonusThreshold: number | null;
  lossBonusPoints: number | null;
};

/** International (BWF-style) scoring: 10 per win, 2 per loss, plus knockout-stage bonuses. */
export const STANDARD_POINTS_CONFIG: PointsConfig = {
  matchWin: 10,
  matchLoss: 2,
  participation: 0,
  stageWinBonus: {
    quarterfinal: 20,
    semifinal: 30,
    final: 50,
  },
  title: 0,
  lossBonusThreshold: null,
  lossBonusPoints: null,
};

/**
 * League scoring (the default for new tournaments): win = 3; lose but reach the
 * floor (15 points) = 1; lose below the floor = 0. No stage bonuses — the
 * explicit zeros stop the partial-override merge from re-adding them.
 */
export const LEAGUE_POINTS_CONFIG: PointsConfig = {
  matchWin: 3,
  matchLoss: 0,
  participation: 0,
  stageWinBonus: {
    quarterfinal: 0,
    semifinal: 0,
    final: 0,
  },
  title: 0,
  lossBonusThreshold: 15,
  lossBonusPoints: 1,
};

/**
 * Fallback for tournaments with NO explicit config (legacy rows created before
 * a system was stored). Kept as STANDARD so existing tournaments never change
 * scoring underneath their organizer; new tournaments are stamped with LEAGUE.
 */
export const DEFAULT_POINTS_CONFIG = STANDARD_POINTS_CONFIG;

export const PointsConfigSchema = z
  .object({
    matchWin: z.number().int().min(0).optional(),
    matchLoss: z.number().int().min(0).optional(),
    participation: z.number().int().min(0).optional(),
    title: z.number().int().min(0).optional(),
    stageWinBonus: z.record(z.string(), z.number().int().min(0)).optional(),
    lossBonusThreshold: z.number().int().min(0).nullable().optional(),
    lossBonusPoints: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export function resolvePointsConfig(override?: unknown): PointsConfig {
  if (!override) return DEFAULT_POINTS_CONFIG;
  const parsed = PointsConfigSchema.safeParse(override);
  if (!parsed.success) return DEFAULT_POINTS_CONFIG;
  const o = parsed.data;
  return {
    matchWin: o.matchWin ?? DEFAULT_POINTS_CONFIG.matchWin,
    matchLoss: o.matchLoss ?? DEFAULT_POINTS_CONFIG.matchLoss,
    participation: o.participation ?? DEFAULT_POINTS_CONFIG.participation,
    title: o.title ?? DEFAULT_POINTS_CONFIG.title,
    stageWinBonus: {
      ...DEFAULT_POINTS_CONFIG.stageWinBonus,
      ...(o.stageWinBonus as Partial<Record<StageType, number>> | undefined),
    },
    lossBonusThreshold: o.lossBonusThreshold ?? null,
    lossBonusPoints: o.lossBonusPoints ?? null,
  };
}

/** Which shipped system a (resolved) config represents. */
export type PointsSystem = "standard" | "league";

/**
 * A stored config is "league" iff it carries a consolation floor — the single
 * feature that distinguishes the two shipped systems. Legacy/null configs
 * resolve to STANDARD (no floor).
 */
export function pointsSystemOf(config: PointsConfig): PointsSystem {
  return config.lossBonusThreshold != null ? "league" : "standard";
}

/** One-line, human description of a system's rule — for Settings / Help / caption. */
export function describePointsSystem(config: PointsConfig): string {
  if (config.lossBonusThreshold != null) {
    return `Win = ${config.matchWin} · lose but reach ${config.lossBonusThreshold} = ${config.lossBonusPoints ?? config.matchLoss} · lose under ${config.lossBonusThreshold} = ${config.matchLoss}`;
  }
  const bonuses = Object.values(config.stageWinBonus).some((v) => (v ?? 0) > 0)
    ? ` (+ knockout-stage win bonuses)`
    : "";
  return `Win = ${config.matchWin} · loss = ${config.matchLoss}${bonuses}`;
}

export type PointAward = { type: PointTxType; points: number; reason: string };

/**
 * Points earned by ONE side from a completed match. Returns an array so the
 * ledger keeps a granular, auditable trail (match result + stage bonus).
 *
 * `sideScore` is that side's representative score — the highest score it
 * reached in any single game — used only to test the league consolation floor
 * when the side LOST. Omitting it disables the floor (falls back to matchLoss).
 */
export function pointsForMatch(params: {
  config: PointsConfig;
  isWinner: boolean;
  stageType?: StageType | null;
  sideScore?: number | null;
}): PointAward[] {
  const { config, isWinner, stageType, sideScore } = params;
  const awards: PointAward[] = [];

  if (isWinner) {
    awards.push({ type: "match_win", points: config.matchWin, reason: "Match win" });
    const bonus = stageType ? config.stageWinBonus[stageType] : undefined;
    if (bonus && bonus > 0) {
      awards.push({
        type: "stage_win",
        points: bonus,
        reason: `${prettyStage(stageType!)} win bonus`,
      });
    }
  } else {
    const reachedFloor =
      config.lossBonusThreshold != null &&
      sideScore != null &&
      sideScore >= config.lossBonusThreshold;
    if (reachedFloor) {
      awards.push({
        type: "match_loss",
        points: config.lossBonusPoints ?? config.matchLoss,
        reason: `Close loss (reached ${config.lossBonusThreshold})`,
      });
    } else {
      awards.push({ type: "match_loss", points: config.matchLoss, reason: "Match played" });
    }
  }

  return awards;
}

function prettyStage(s: StageType): string {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function sumAwards(awards: PointAward[]): number {
  return awards.reduce((t, a) => t + a.points, 0);
}

/**
 * Points for the GLOBAL cross-workspace ranking: the International (Standard)
 * match points applied uniformly — win 10, loss 2. Knockout-stage bonuses are
 * tournament-scoped and deliberately excluded from the global board, so this
 * stays derivable from a player's win/loss totals with no per-match recompute.
 */
export function globalRankingPoints(wins: number, losses: number): number {
  return wins * STANDARD_POINTS_CONFIG.matchWin + losses * STANDARD_POINTS_CONFIG.matchLoss;
}

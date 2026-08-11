import { z } from "zod";
import type { PointTxType, StageType } from "@/lib/domain/constants";

/**
 * Configurable points system — pure. The default table matches the product
 * spec; a tournament may override any subset via its `pointsConfig` JSON.
 * Point transactions (not totals) are the source of truth, so changing the
 * config only affects future awards unless a recompute is run.
 */
export type PointsConfig = {
  matchWin: number;
  matchLoss: number;
  participation: number;
  /** Bonus awarded to the winner of a match, by the stage it was played in. */
  stageWinBonus: Partial<Record<StageType, number>>;
  /** Bonus for winning the tournament (title). */
  title: number;
};

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  matchWin: 10,
  matchLoss: 2,
  participation: 0,
  stageWinBonus: {
    quarterfinal: 20,
    semifinal: 30,
    final: 50,
  },
  title: 0,
};

export const PointsConfigSchema = z
  .object({
    matchWin: z.number().int().min(0).optional(),
    matchLoss: z.number().int().min(0).optional(),
    participation: z.number().int().min(0).optional(),
    title: z.number().int().min(0).optional(),
    stageWinBonus: z.record(z.string(), z.number().int().min(0)).optional(),
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
  };
}

export type PointAward = { type: PointTxType; points: number; reason: string };

/**
 * Points earned by ONE side from a completed match. Returns an array so the
 * ledger keeps a granular, auditable trail (match result + stage bonus).
 */
export function pointsForMatch(params: {
  config: PointsConfig;
  isWinner: boolean;
  stageType?: StageType | null;
}): PointAward[] {
  const { config, isWinner, stageType } = params;
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
    awards.push({ type: "match_loss", points: config.matchLoss, reason: "Match played" });
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

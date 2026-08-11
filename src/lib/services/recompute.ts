import type { Prisma } from "@prisma/client";
import { resolvePointsConfig, pointsForMatch, sumAwards } from "@/lib/engines/points";
import { assignRanks, winPercentage, type RankableStat } from "@/lib/engines/leaderboard";
import type { StageType } from "@/lib/domain/constants";

type Tx = Prisma.TransactionClient;

/**
 * Recompute functions. Everything here is DERIVED from immutable match results
 * + the point ledger, so any standing/ranking can be rebuilt at any time. These
 * run INSIDE the score-submission transaction so stats never drift from results.
 */

/** Player ids involved in a match (a doubles side contributes both players). */
export async function involvedPlayerIds(tx: Tx, matchId: string): Promise<string[]> {
  const parts = await tx.matchParticipant.findMany({
    where: { matchId },
    select: { playerId: true, teamId: true },
  });
  const ids = new Set<string>();
  for (const p of parts) {
    if (p.playerId) ids.add(p.playerId);
    if (p.teamId) {
      const tps = await tx.teamPlayer.findMany({
        where: { teamId: p.teamId },
        select: { playerId: true },
      });
      tps.forEach((t) => ids.add(t.playerId));
    }
  }
  return [...ids];
}

/**
 * Rebuild the per-tournament leaderboard from its completed matches.
 * Points are derived via the points engine so standings always match results.
 */
export async function recomputeTournamentLeaderboard(tx: Tx, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true, pointsConfig: true },
  });
  if (!tournament) return;

  const config = resolvePointsConfig(tournament.pointsConfig ?? undefined);
  const isTeamFormat = tournament.format !== "singles";

  const matches = await tx.match.findMany({
    where: { tournamentId, status: "completed", deletedAt: null },
    include: { participants: true, stage: true },
  });

  type Agg = {
    id: string;
    isTeam: boolean;
    matchesPlayed: number;
    wins: number;
    losses: number;
    points: number;
    stageOrder: number;
    stageReached: string | null;
  };
  const agg = new Map<string, Agg>();
  const bump = (
    key: string,
    isTeam: boolean,
    isWinner: boolean,
    pts: number,
    stageOrder: number,
    stageName: string | null
  ) => {
    const a =
      agg.get(key) ??
      { id: key, isTeam, matchesPlayed: 0, wins: 0, losses: 0, points: 0, stageOrder: -1, stageReached: null };
    a.matchesPlayed += 1;
    a.wins += isWinner ? 1 : 0;
    a.losses += isWinner ? 0 : 1;
    a.points += pts;
    if (stageOrder > a.stageOrder) {
      a.stageOrder = stageOrder;
      a.stageReached = stageName;
    }
    agg.set(key, a);
  };

  for (const m of matches) {
    const stageType = (m.stage?.type ?? null) as StageType | null;
    const stageOrder = m.stage?.order ?? -1;
    const stageName = m.stage?.name ?? null;
    for (const p of m.participants) {
      const key = p.teamId ?? p.playerId;
      if (!key) continue;
      const pts = sumAwards(pointsForMatch({ config, isWinner: p.isWinner, stageType }));
      bump(key, Boolean(p.teamId), p.isWinner, pts, stageOrder, stageName);
    }
  }

  // Seed zero-rows for registered-but-not-yet-played participants.
  if (isTeamFormat) {
    const teams = await tx.team.findMany({
      where: { tournamentId, deletedAt: null },
      select: { id: true },
    });
    for (const t of teams)
      if (!agg.has(t.id))
        agg.set(t.id, { id: t.id, isTeam: true, matchesPlayed: 0, wins: 0, losses: 0, points: 0, stageOrder: -1, stageReached: null });
  } else {
    const tps = await tx.tournamentPlayer.findMany({
      where: { tournamentId, status: "registered" },
      select: { playerId: true },
    });
    for (const tp of tps)
      if (!agg.has(tp.playerId))
        agg.set(tp.playerId, { id: tp.playerId, isTeam: false, matchesPlayed: 0, wins: 0, losses: 0, points: 0, stageOrder: -1, stageReached: null });
  }

  const ranked = assignRanks(
    [...agg.values()].map<RankableStat>((a) => ({
      id: a.id,
      points: a.points,
      wins: a.wins,
      losses: a.losses,
      matchesPlayed: a.matchesPlayed,
    }))
  );
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  // Replace the tournament's leaderboard rows atomically.
  await tx.leaderboardEntry.deleteMany({ where: { tournamentId } });
  for (const a of agg.values()) {
    await tx.leaderboardEntry.create({
      data: {
        tournamentId,
        playerId: a.isTeam ? null : a.id,
        teamId: a.isTeam ? a.id : null,
        matchesPlayed: a.matchesPlayed,
        wins: a.wins,
        losses: a.losses,
        points: a.points,
        stageReached: a.stageReached,
        rank: rankById.get(a.id) ?? null,
        position: rankById.get(a.id) ?? null,
      },
    });
  }
}

/** Rebuild one player's global aggregate stats from matches + the ledger. */
export async function recomputePlayerAggregates(tx: Tx, playerId: string) {
  const teamIds = (
    await tx.teamPlayer.findMany({ where: { playerId }, select: { teamId: true } })
  ).map((t) => t.teamId);

  const participants = await tx.matchParticipant.findMany({
    where: {
      // Exclude matches whose tournament was soft-deleted so global stats
      // never count results from removed tournaments.
      match: { status: "completed", deletedAt: null, tournament: { deletedAt: null } },
      OR: [{ playerId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
    },
    include: { match: { include: { stage: true } } },
  });

  const matchesPlayed = participants.length;
  const wins = participants.filter((p) => p.isWinner).length;
  const losses = matchesPlayed - wins;
  const tournamentsPlayed = new Set(participants.map((p) => p.match.tournamentId)).size;
  const titles = new Set(
    participants
      .filter((p) => p.isWinner && p.match.stage?.type === "final")
      .map((p) => p.match.tournamentId)
  ).size;

  const totals = await tx.pointTransaction.aggregate({
    where: {
      playerId,
      OR: [{ tournamentId: null }, { tournament: { deletedAt: null } }],
    },
    _sum: { points: true },
  });
  const totalPoints = totals._sum.points ?? 0;

  await tx.playerRanking.upsert({
    where: { playerId },
    update: {
      totalPoints,
      matchesPlayed,
      wins,
      losses,
      tournamentsPlayed,
      titles,
      winPercentage: winPercentage(wins, matchesPlayed),
    },
    create: {
      playerId,
      totalPoints,
      matchesPlayed,
      wins,
      losses,
      tournamentsPlayed,
      titles,
      winPercentage: winPercentage(wins, matchesPlayed),
    },
  });
}

/** Reassign ranks (and update bestRank) WITHIN each organization. */
export async function recomputeGlobalRanks(tx: Tx) {
  const rows = await tx.playerRanking.findMany({
    include: { player: { select: { organizationId: true } } },
  });

  // Group by organization so ranks are per-workspace.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.player.organizationId ?? "__none__";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const rankByPlayer = new Map<string, number>();
  for (const group of groups.values()) {
    const ranked = assignRanks(
      group.map<RankableStat>((r) => ({
        id: r.playerId,
        points: r.totalPoints,
        wins: r.wins,
        losses: r.losses,
        matchesPlayed: r.matchesPlayed,
        titles: r.titles,
      }))
    );
    ranked.forEach((r) => rankByPlayer.set(r.id, r.rank));
  }

  for (const r of rows) {
    const rank = rankByPlayer.get(r.playerId) ?? null;
    const bestRank =
      rank == null ? r.bestRank : r.bestRank == null ? rank : Math.min(r.bestRank, rank);
    await tx.playerRanking.update({ where: { playerId: r.playerId }, data: { rank, bestRank } });
  }
}

/** Full recompute after a match result changes. */
export async function recomputeAfterMatch(tx: Tx, tournamentId: string, playerIds: string[]) {
  await recomputeTournamentLeaderboard(tx, tournamentId);
  for (const pid of playerIds) await recomputePlayerAggregates(tx, pid);
  await recomputeGlobalRanks(tx);
}

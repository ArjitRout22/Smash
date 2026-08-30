import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolvePointsConfig, pointsForMatch, sumAwards } from "@/lib/engines/points";
import { assignRanks, winPercentage, type RankableStat } from "@/lib/engines/leaderboard";
import { replayElo, ELO_START, type EloMatch } from "@/lib/engines/elo";
import type { StageType } from "@/lib/domain/constants";

type Tx = Prisma.TransactionClient;

/**
 * Recompute functions. Everything here is DERIVED from immutable match results
 * + the point ledger, so any standing/ranking can be rebuilt at any time. These
 * run INSIDE the score-submission transaction so stats never drift from results.
 */

/**
 * Player ids involved in a match (a doubles side contributes both players).
 * Uses the immutable per-match SNAPSHOT — the players who actually played — not
 * the team's current members, so stats stay correct after a pair change.
 */
export async function involvedPlayerIds(tx: Tx, matchId: string): Promise<string[]> {
  const parts = await tx.matchParticipant.findMany({
    where: { matchId },
    select: { playerId: true, snapshotPlayers: { select: { playerId: true } } },
  });
  const ids = new Set<string>();
  for (const p of parts) {
    if (p.playerId) ids.add(p.playerId);
    for (const sp of p.snapshotPlayers) ids.add(sp.playerId);
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
    include: { participants: true, stage: true, games: true },
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
    // Each side's highest single-game score, for the league consolation floor.
    const maxScoreA = m.games.length ? Math.max(...m.games.map((g) => g.scoreA)) : 0;
    const maxScoreB = m.games.length ? Math.max(...m.games.map((g) => g.scoreB)) : 0;
    for (const p of m.participants) {
      const key = p.teamId ?? p.playerId;
      if (!key) continue;
      const sideScore = p.side === "A" ? maxScoreA : maxScoreB;
      const pts = sumAwards(pointsForMatch({ config, isWinner: p.isWinner, stageType, sideScore }));
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

  // Replace the tournament's leaderboard rows atomically (one createMany).
  await tx.leaderboardEntry.deleteMany({ where: { tournamentId } });
  const entries = [...agg.values()].map((a) => ({
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
  }));
  if (entries.length) await tx.leaderboardEntry.createMany({ data: entries });
}

/**
 * Which team/player ids WON a tournament (from its final standings). For group
 * play it's every team in the group with the most total points ("which group
 * won"); otherwise the #1-ranked entry. Only counts entries that actually played.
 */
async function tournamentWinners(tx: Tx, tournamentId: string): Promise<{ teamIds: Set<string>; playerIds: Set<string> }> {
  const entries = await tx.leaderboardEntry.findMany({
    where: { tournamentId },
    select: { teamId: true, playerId: true, points: true, rank: true, matchesPlayed: true, team: { select: { group: true } } },
  });
  const played = entries.filter((e) => e.matchesPlayed > 0);
  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  if (!played.length) return { teamIds, playerIds };

  const hasGroups = played.some((e) => e.team?.group);
  if (hasGroups) {
    const totals = new Map<string, number>();
    for (const e of played) {
      const g = e.team?.group;
      if (g) totals.set(g, (totals.get(g) ?? 0) + e.points);
    }
    let bestGroup: string | null = null;
    let bestPts = -Infinity;
    for (const [g, pts] of totals) if (pts > bestPts) { bestPts = pts; bestGroup = g; }
    for (const e of played) if (e.teamId && e.team?.group === bestGroup) teamIds.add(e.teamId);
    return { teamIds, playerIds };
  }

  for (const e of played) {
    if (e.rank !== 1) continue;
    if (e.teamId) teamIds.add(e.teamId);
    if (e.playerId) playerIds.add(e.playerId);
  }
  return { teamIds, playerIds };
}

/** Rebuild one player's global aggregate stats from matches + the ledger. */
export async function recomputePlayerAggregates(tx: Tx, playerId: string) {
  const participants = await tx.matchParticipant.findMany({
    where: {
      // Exclude matches whose tournament was soft-deleted so global stats
      // never count results from removed tournaments.
      match: { status: "completed", deletedAt: null, tournament: { deletedAt: null } },
      // Singles → this exact player; doubles → the match's player SNAPSHOT
      // (who actually played), so a later team pair change never rewrites
      // anyone's win/loss history.
      OR: [{ playerId }, { snapshotPlayers: { some: { playerId } } }],
    },
    include: { match: { include: { stage: true } } },
  });

  const matchesPlayed = participants.length;
  const wins = participants.filter((p) => p.isWinner).length;
  const losses = matchesPlayed - wins;
  const tournamentsPlayed = new Set(participants.map((p) => p.match.tournamentId)).size;

  // A "title" = winning a tournament. Either winning a knockout final, OR being
  // on the winning side of a COMPLETED tournament's final standings. The winner
  // is: for group play, EVERY team in the group with the most total points
  // ("which group won"); otherwise the #1 entry. Every player on a winning team
  // gets the title.
  const finalWinTournamentIds = participants
    .filter((p) => p.isWinner && p.match.stage?.type === "final")
    .map((p) => p.match.tournamentId);
  const myEntries = await tx.leaderboardEntry.findMany({
    where: {
      tournament: { status: "completed", deletedAt: null },
      OR: [{ playerId }, { team: { teamPlayers: { some: { playerId } } } }],
    },
    select: { tournamentId: true, teamId: true, playerId: true },
  });
  const standingTitleTournamentIds: string[] = [];
  for (const me of myEntries) {
    const winners = await tournamentWinners(tx, me.tournamentId);
    if ((me.teamId && winners.teamIds.has(me.teamId)) || (me.playerId && winners.playerIds.has(me.playerId))) {
      standingTitleTournamentIds.push(me.tournamentId);
    }
  }
  const titles = new Set([...finalWinTournamentIds, ...standingTitleTournamentIds]).size;

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

/**
 * Recompute every player's global Elo rating by replaying ALL completed matches
 * (from non-deleted tournaments) in chronological order. Elo is opponent-relative
 * and order-dependent, so it can't be derived on-read from win/loss totals like
 * `globalRankingPoints` was — it's a materialized value on `PlayerRanking`.
 *
 * Runs OUTSIDE the per-match transaction (call it after a result changes): one
 * read of all completed matches, an in-memory replay, and one batched UPDATE, so
 * it stays a couple of round-trips regardless of draw size — no long-held tx.
 */
export async function recomputeGlobalElo() {
  const matches = await prisma.match.findMany({
    where: { status: "completed", deletedAt: null, tournament: { deletedAt: null } },
    select: {
      id: true,
      closedAt: true,
      createdAt: true,
      participants: {
        select: {
          side: true,
          isWinner: true,
          playerId: true,
          snapshotPlayers: { select: { playerId: true } },
        },
      },
    },
    // Chronological: when a match closed (falls back to creation), stable by id.
    orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const eloMatches: EloMatch[] = [];
  for (const m of matches) {
    const sideA: string[] = [];
    const sideB: string[] = [];
    let winner: "A" | "B" | null = null;
    for (const p of m.participants) {
      // Doubles → the immutable player snapshot (who actually played); singles →
      // the participant's playerId. Mirrors involvedPlayerIds / recompute.
      const ids = p.snapshotPlayers.length
        ? p.snapshotPlayers.map((s) => s.playerId)
        : p.playerId
          ? [p.playerId]
          : [];
      if (p.side === "A") sideA.push(...ids);
      else if (p.side === "B") sideB.push(...ids);
      if (p.isWinner) winner = p.side as "A" | "B";
    }
    if (sideA.length && sideB.length && winner) eloMatches.push({ sideA, sideB, winner });
  }

  const ratings = replayElo(eloMatches);

  // Write every ranking row's rating (unplayed players → start).
  const rows = await prisma.playerRanking.findMany({ select: { playerId: true } });
  await writeEloRatings(rows.map((r) => [r.playerId, ratings.get(r.playerId) ?? ELO_START]));
}

/** Set eloRating for the given players in ONE batched UPDATE (keeps the score
 *  path's added round-trips to a single write regardless of how many players). */
async function writeEloRatings(entries: [string, number][]) {
  if (!entries.length) return;
  const values = Prisma.join(entries.map(([id, elo]) => Prisma.sql`(${id}::text, ${elo}::int)`));
  await prisma.$executeRaw`
    UPDATE "PlayerRanking" AS pr
    SET "eloRating" = v.elo
    FROM (VALUES ${values}) AS v(player_id, elo)
    WHERE pr."playerId" = v.player_id`;
}

/** Read a match's two sides as Elo player-id lists + the winning side. */
async function matchAsEloSides(
  matchId: string
): Promise<{ sideA: string[]; sideB: string[]; winner: "A" | "B" } | null> {
  const m = await prisma.match.findFirst({
    where: { id: matchId, status: "completed", deletedAt: null, tournament: { deletedAt: null } },
    select: {
      participants: {
        select: { side: true, isWinner: true, playerId: true, snapshotPlayers: { select: { playerId: true } } },
      },
    },
  });
  if (!m) return null;
  const sideA: string[] = [];
  const sideB: string[] = [];
  let winner: "A" | "B" | null = null;
  for (const p of m.participants) {
    const ids = p.snapshotPlayers.length
      ? p.snapshotPlayers.map((s) => s.playerId)
      : p.playerId
        ? [p.playerId]
        : [];
    if (p.side === "A") sideA.push(...ids);
    else if (p.side === "B") sideB.push(...ids);
    if (p.isWinner) winner = p.side as "A" | "B";
  }
  if (!sideA.length || !sideB.length || !winner) return null;
  return { sideA, sideB, winner };
}

/**
 * Apply ONE freshly-completed match to global Elo incrementally. When a match is
 * scored for the first time it is (by definition) the latest result, so the
 * involved players' CURRENT ratings are exactly their pre-match ratings — making
 * an incremental update identical to a full replay, but O(1) instead of O(all
 * matches). Corrections to an already-scored match, and reversals/deletes, must
 * use `recomputeGlobalElo` (a full replay) instead, since they change history.
 */
export async function applyMatchElo(matchId: string) {
  const sides = await matchAsEloSides(matchId);
  if (!sides) return;
  const ids = [...new Set([...sides.sideA, ...sides.sideB])];
  const current = await prisma.playerRanking.findMany({
    where: { playerId: { in: ids } },
    select: { playerId: true, eloRating: true },
  });
  const initial = new Map(current.map((r) => [r.playerId, r.eloRating]));
  const updated = replayElo([sides], { initial });
  // One batched write so the score path adds a single round-trip, not one per player.
  await writeEloRatings(ids.map((id) => [id, updated.get(id) ?? ELO_START]));
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

/**
 * Recompute after a match result changes. Only touches what's bounded by the
 * tournament (its leaderboard + the handful of players in this match) — global
 * ranks are NOT rewritten here (that was an O(all-players) write on every score,
 * the main cause of slow saves). Ranks are computed on-read instead: the global
 * leaderboard ranks live, and getPlayerStatistics derives currentRank on demand.
 */
export async function recomputeAfterMatch(tx: Tx, tournamentId: string, playerIds: string[]) {
  await recomputeTournamentLeaderboard(tx, tournamentId);
  for (const pid of playerIds) await recomputePlayerAggregates(tx, pid);
}

/**
 * Recompute a tournament's leaderboard AND every involved player's aggregate
 * stats. Use when a change affects the whole tournament rather than one match —
 * e.g. marking it completed (credits the winner's title), or deleting a match.
 *
 * Runs as SEVERAL short transactions (leaderboard, then each player), NOT one
 * long interactive transaction: recomputing the whole field in a single tx makes
 * ~5 round-trips per player, which against a distant DB (Neon) blows past the
 * transaction timeout (observed 33s > 30s). Each piece here is small and
 * idempotent, so splitting them is safe. Ranks stay on-read (no global rewrite).
 */
export async function recomputeTournamentAndPlayers(tournamentId: string) {
  await prisma.$transaction((tx) => recomputeTournamentLeaderboard(tx, tournamentId), { timeout: 20000 });

  const ids = new Set<string>();
  (await prisma.tournamentPlayer.findMany({ where: { tournamentId }, select: { playerId: true } })).forEach((t) => ids.add(t.playerId));
  const teams = await prisma.team.findMany({ where: { tournamentId }, select: { id: true } });
  if (teams.length) {
    (await prisma.teamPlayer.findMany({ where: { teamId: { in: teams.map((t) => t.id) } }, select: { playerId: true } })).forEach((t) => ids.add(t.playerId));
  }
  // Include anyone with a snapshot in this tournament's matches (covers players
  // swapped off a team but who still have frozen history here).
  (await prisma.matchParticipantPlayer.findMany({
    where: { participant: { match: { tournamentId } } },
    select: { playerId: true },
    distinct: ["playerId"],
  })).forEach((s) => ids.add(s.playerId));

  for (const pid of ids) {
    await prisma.$transaction((tx) => recomputePlayerAggregates(tx, pid), { timeout: 20000 });
  }

  // Global Elo depends on ALL players' match history, not just this tournament's,
  // so refresh it after the per-player aggregates are settled.
  await recomputeGlobalElo();
}

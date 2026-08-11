import { prisma } from "@/lib/db/prisma";
import { assignRanks, type RankableStat } from "@/lib/engines/leaderboard";
import type { Pagination } from "@/lib/api/pagination";

type SortKey = "points" | "wins" | "winPercentage" | "tournaments" | "recent";

/**
 * Global player leaderboard. Ranks are derived from the (already recomputed)
 * PlayerRanking aggregates via the shared ranking engine, so ordering is
 * deterministic and matches per-tournament standings.
 */
export async function getPlayerLeaderboard(
  p: Pagination,
  opts: { sortBy?: string }
) {
  const rows = await prisma.playerRanking.findMany({
    where: p.search
      ? {
          player: {
            deletedAt: null,
            OR: [
              { fullName: { contains: p.search, mode: "insensitive" } },
              { displayName: { contains: p.search, mode: "insensitive" } },
            ],
          },
        }
      : { player: { deletedAt: null } },
    include: { player: { select: { id: true, displayName: true, fullName: true, city: true } } },
  });

  // Canonical ranks (points → wins → win% → …) via the engine.
  const ranked = assignRanks(
    rows.map<RankableStat>((r) => ({
      id: r.playerId,
      points: r.totalPoints,
      wins: r.wins,
      losses: r.losses,
      matchesPlayed: r.matchesPlayed,
      titles: r.titles,
    }))
  );
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  const enriched = rows.map((r) => ({
    rank: rankById.get(r.playerId) ?? null,
    playerId: r.playerId,
    name: r.player.displayName,
    fullName: r.player.fullName,
    city: r.player.city,
    matchesPlayed: r.matchesPlayed,
    wins: r.wins,
    losses: r.losses,
    winPercentage: r.winPercentage,
    points: r.totalPoints,
    tournaments: r.tournamentsPlayed,
    titles: r.titles,
    updatedAt: r.updatedAt,
  }));

  const sortBy = (opts.sortBy as SortKey) ?? "points";
  const comparators: Record<SortKey, (a: typeof enriched[number], b: typeof enriched[number]) => number> = {
    points: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9),
    wins: (a, b) => b.wins - a.wins,
    winPercentage: (a, b) => b.winPercentage - a.winPercentage,
    tournaments: (a, b) => b.tournaments - a.tournaments,
    recent: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  };
  enriched.sort(comparators[sortBy] ?? comparators.points);

  const total = enriched.length;
  const start = (p.page - 1) * p.pageSize;
  return { items: enriched.slice(start, start + p.pageSize), total };
}

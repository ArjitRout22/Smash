import { prisma } from "@/lib/db/prisma";
import { assignRanks, type RankableStat } from "@/lib/engines/leaderboard";
import type { Pagination } from "@/lib/api/pagination";
import type { AuthUser } from "@/lib/auth/authorize";

type SortKey = "points" | "wins" | "winPercentage" | "tournaments" | "recent";

/**
 * GLOBAL player leaderboard — every player across all workspaces (the player
 * directory is global; so is the ranking). The headline number is each player's
 * **Elo rating** (`PlayerRanking.eloRating`, everyone starts at 1000), a
 * materialized value recomputed by replaying completed matches. Ranks come from
 * the shared engine (rating → wins → win% → …) for deterministic ordering.
 */
export async function getPlayerLeaderboard(
  actor: AuthUser,
  p: Pagination,
  opts: { sortBy?: string }
) {
  const rows = await prisma.playerRanking.findMany({
    where: {
      player: {
        deletedAt: null,
        ...(p.search
          ? {
              OR: [
                { fullName: { contains: p.search, mode: "insensitive" as const } },
                { displayName: { contains: p.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    },
    include: { player: { select: { id: true, displayName: true, fullName: true, city: true, photoUrl: true } } },
  });

  // Canonical ranks (rating → wins → win% → …) via the engine.
  const ranked = assignRanks(
    rows.map<RankableStat>((r) => ({
      id: r.playerId,
      points: r.eloRating,
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
    photoUrl: r.player.photoUrl,
    matchesPlayed: r.matchesPlayed,
    wins: r.wins,
    losses: r.losses,
    winPercentage: r.winPercentage,
    points: r.eloRating,
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

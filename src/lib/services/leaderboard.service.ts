import { prisma } from "@/lib/db/prisma";
import type { Pagination } from "@/lib/api/pagination";
import type { AuthUser } from "@/lib/auth/authorize";

type SortKey = "points" | "wins" | "winPercentage" | "tournaments" | "recent";
type Category = "singles" | "doubles";

/** Win % from wins/matches, 2 decimals, zero-safe (point 11). */
function winPct(wins: number, matches: number): number {
  return matches > 0 ? Math.round((wins / matches) * 10000) / 100 : 0;
}

/**
 * GLOBAL player leaderboard for one CATEGORY (singles or doubles — never mixed).
 * The headline number is the player's Elo rating from `PlayerCategoryRating`
 * (materialized by the rating service from match history). Ranking is by rating,
 * with tiebreakers (more matches → higher win% → more wins) and COMPETITION ranks
 * (ties share a rank, e.g. 1,2,3,4,4,6). Tournaments/titles come from the combined
 * ranking row (they don't affect Elo — point 14). Elo is never computed here.
 */
export async function getPlayerLeaderboard(
  actor: AuthUser,
  p: Pagination,
  opts: { sortBy?: string; category?: string }
) {
  const category: Category = opts.category === "singles" ? "singles" : "doubles";

  const rows = await prisma.playerCategoryRating.findMany({
    where: {
      category,
      matches: { gt: 0 }, // only RATED players — no games, no rank
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
    include: {
      player: {
        select: {
          id: true, displayName: true, fullName: true, city: true, photoUrl: true,
          ranking: { select: { tournamentsPlayed: true, titles: true } },
        },
      },
    },
  });

  const enriched = rows.map((r) => ({
    playerId: r.playerId,
    name: r.player.displayName,
    fullName: r.player.fullName,
    city: r.player.city,
    photoUrl: r.player.photoUrl,
    matchesPlayed: r.matches,
    wins: r.wins,
    losses: r.losses,
    winPercentage: winPct(r.wins, r.matches),
    points: r.rating, // "points" column on the client = the Elo rating
    ratingChange: r.lastChange ?? null,
    tournaments: r.player.ranking?.tournamentsPlayed ?? 0,
    titles: r.player.ranking?.titles ?? 0,
    updatedAt: r.updatedAt,
    rank: null as number | null,
  }));

  // Canonical order: rating → more matches → higher win% → more wins.
  const canonical = [...enriched].sort(
    (a, b) =>
      b.points - a.points ||
      b.matchesPlayed - a.matchesPlayed ||
      b.winPercentage - a.winPercentage ||
      b.wins - a.wins
  );
  // Competition ranking: identical (rating,matches,win%,wins) share a rank; the
  // next distinct row jumps (…,4,4,6). Assign onto the enriched objects.
  const keyOf = (r: typeof canonical[number]) => `${r.points}|${r.matchesPlayed}|${r.winPercentage}|${r.wins}`;
  let lastKey: string | null = null;
  let lastRank = 0;
  canonical.forEach((r, i) => {
    const k = keyOf(r);
    r.rank = k === lastKey ? lastRank : i + 1;
    lastKey = k;
    lastRank = r.rank;
  });

  const sortBy = (opts.sortBy as SortKey) ?? "points";
  const comparators: Record<SortKey, (a: typeof enriched[number], b: typeof enriched[number]) => number> = {
    points: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9),
    wins: (a, b) => b.wins - a.wins,
    winPercentage: (a, b) => b.winPercentage - a.winPercentage,
    tournaments: (a, b) => b.tournaments - a.tournaments,
    recent: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  };
  const ordered = [...canonical].sort(comparators[sortBy] ?? comparators.points);

  const total = ordered.length;
  const start = (p.page - 1) * p.pageSize;
  return { items: ordered.slice(start, start + p.pageSize), total };
}

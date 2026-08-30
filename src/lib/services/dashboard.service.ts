import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { serializeMatch } from "@/lib/services/match.service";
import type { AuthUser } from "@/lib/auth/authorize";
import { isPlatformAdmin } from "@/lib/auth/tenancy";

const matchInclude = {
  tournament: { select: { id: true, name: true, format: true, organizationId: true } },
  stage: { select: { id: true, name: true, type: true, order: true } },
  games: { orderBy: { gameNumber: "asc" as const } },
  participants: {
    include: {
      player: { select: { id: true, displayName: true, fullName: true } },
      team: {
        select: {
          id: true,
          name: true,
          teamPlayers: { include: { player: { select: { id: true, displayName: true } } } },
        },
      },
      snapshotPlayers: { select: { playerId: true, displayName: true, position: true }, orderBy: { position: "asc" as const } },
    },
  },
} as const;

/**
 * The COMMUNITY overview — counts, public match feeds, and the global top
 * players — is identical for every viewer, so it's cached (short TTL) instead of
 * re-running ~8 cross-region queries on every dashboard load. This is the main
 * fix for slow dashboards; the per-user activity feed stays live (below).
 * Bounded to 30s staleness and re-derivable at any time, so caching is safe.
 */
const getCommunityDashboard = unstable_cache(
  async () => {
    const publicMatch = { tournament: { visibility: "public", deletedAt: null } };
    const [
      totalTournaments,
      activeTournaments,
      completedTournaments,
      totalPlayers,
      totalTeams,
      recentMatchesRaw,
      upcomingMatchesRaw,
      topPlayersRaw,
    ] = await Promise.all([
      prisma.tournament.count({ where: { deletedAt: null } }),
      prisma.tournament.count({ where: { deletedAt: null, status: "ongoing" } }),
      prisma.tournament.count({ where: { deletedAt: null, status: "completed" } }),
      prisma.player.count({ where: { deletedAt: null } }),
      prisma.team.count({ where: { deletedAt: null } }),
      prisma.match.findMany({
        where: { deletedAt: null, status: "completed", ...publicMatch },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: matchInclude,
      }),
      prisma.match.findMany({
        where: { deletedAt: null, status: { in: ["scheduled", "in_progress"] }, ...publicMatch },
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
        take: 5,
        include: matchInclude,
      }),
      prisma.playerRanking.findMany({
        where: { matchesPlayed: { gt: 0 } }, // only rated players (see leaderboard.service)
        orderBy: [{ eloRating: "desc" }, { winPercentage: "desc" }],
        take: 5,
        include: { player: { select: { id: true, displayName: true, photoUrl: true } } },
      }),
    ]);

    return {
      stats: { totalTournaments, activeTournaments, completedTournaments, totalPlayers, totalTeams },
      recentMatches: recentMatchesRaw.map(serializeMatch),
      upcomingMatches: upcomingMatchesRaw.map(serializeMatch),
      // Competition ranking: players tied on rating share a rank (e.g. 1,1,1,1,5)
      // instead of arbitrary 1,2,3,4 — matches the leaderboard engine.
      topPlayers: (() => {
        let lastPts: number | null = null;
        let lastRank = 0;
        return topPlayersRaw.map((r, i) => {
          const points = r.eloRating;
          const rank = points === lastPts ? lastRank : i + 1;
          lastPts = points;
          lastRank = rank;
          return { playerId: r.playerId, name: r.player.displayName, photoUrl: r.player.photoUrl, points, wins: r.wins, losses: r.losses, rank };
        });
      })(),
    };
  },
  ["community-dashboard"],
  { revalidate: 30, tags: ["dashboard"] }
);

export async function getDashboard(actor: AuthUser) {
  // Community data (shared, cached) + this viewer's own recent activity (live).
  const [community, recentActivity] = await Promise.all([
    getCommunityDashboard(),
    prisma.auditLog.findMany({
      // Non-admins see only their own recent activity.
      where: {
        action: { in: ["tournament.created", "stage.bracket.generated", "match.score.submitted"] },
        ...(isPlatformAdmin(actor) ? {} : { actorUserId: actor.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);

  return { ...community, recentActivity };
}

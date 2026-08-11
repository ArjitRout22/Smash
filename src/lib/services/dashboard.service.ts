import { prisma } from "@/lib/db/prisma";
import { serializeMatch } from "@/lib/services/match.service";

const matchInclude = {
  tournament: { select: { id: true, name: true, format: true } },
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
    },
  },
} as const;

export async function getDashboard() {
  const [
    totalTournaments,
    activeTournaments,
    completedTournaments,
    totalPlayers,
    totalTeams,
    recentMatchesRaw,
    upcomingMatchesRaw,
    topPlayersRaw,
    recentActivity,
  ] = await Promise.all([
    prisma.tournament.count({ where: { deletedAt: null } }),
    prisma.tournament.count({ where: { deletedAt: null, status: "ongoing" } }),
    prisma.tournament.count({ where: { deletedAt: null, status: "completed" } }),
    prisma.player.count({ where: { deletedAt: null } }),
    prisma.team.count({ where: { deletedAt: null } }),
    prisma.match.findMany({
      where: { deletedAt: null, status: "completed" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: matchInclude,
    }),
    prisma.match.findMany({
      where: { deletedAt: null, status: { in: ["scheduled", "in_progress"] } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 5,
      include: matchInclude,
    }),
    prisma.playerRanking.findMany({
      orderBy: [{ totalPoints: "desc" }, { wins: "desc" }],
      take: 5,
      include: { player: { select: { id: true, displayName: true } } },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["tournament.created", "stage.bracket.generated", "match.score.submitted"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);

  return {
    stats: {
      totalTournaments,
      activeTournaments,
      completedTournaments,
      totalPlayers,
      totalTeams,
    },
    recentMatches: recentMatchesRaw.map(serializeMatch),
    upcomingMatches: upcomingMatchesRaw.map(serializeMatch),
    topPlayers: topPlayersRaw.map((r) => ({
      playerId: r.playerId,
      name: r.player.displayName,
      points: r.totalPoints,
      wins: r.wins,
      losses: r.losses,
      rank: r.rank,
    })),
    recentActivity,
  };
}

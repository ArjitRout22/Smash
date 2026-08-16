import { prisma } from "@/lib/db/prisma";
import { serializeMatch } from "@/lib/services/match.service";
import { globalRankingPoints } from "@/lib/engines/points";
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

export async function getDashboard(actor: AuthUser) {
  // The dashboard is a COMMUNITY overview: counts + the leaderboard are global
  // (whole-app totals) so every user — organizer, joined player, or spectator —
  // sees the same meaningful numbers, not their own (often empty) workspace.
  // Match feeds are limited to PUBLIC tournaments so private cross-tenant data is
  // never surfaced on someone else's dashboard.
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
    recentActivity,
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
      orderBy: [{ wins: "desc" }, { winPercentage: "desc" }],
      take: 5,
      include: { player: { select: { id: true, displayName: true, photoUrl: true } } },
    }),
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
    topPlayers: topPlayersRaw.map((r, i) => ({
      playerId: r.playerId,
      name: r.player.displayName,
      photoUrl: r.player.photoUrl,
      points: globalRankingPoints(r.wins, r.losses),
      wins: r.wins,
      losses: r.losses,
      rank: i + 1, // position within this top-N (ranks are computed on-read now)
    })),
    recentActivity,
  };
}

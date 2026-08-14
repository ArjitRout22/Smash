import { prisma } from "@/lib/db/prisma";
import { serializeMatch } from "@/lib/services/match.service";
import { globalRankingPoints } from "@/lib/engines/points";
import type { AuthUser } from "@/lib/auth/authorize";
import { orgFilter, isPlatformAdmin } from "@/lib/auth/tenancy";

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
  const org = orgFilter(actor); // {} for platform admin, else { organizationId }
  const matchOrg = isPlatformAdmin(actor)
    ? {}
    : { tournament: { organizationId: actor.organizationId ?? "__no_org__" } };
  const playerRankOrg = isPlatformAdmin(actor)
    ? {}
    : { player: { organizationId: actor.organizationId ?? "__no_org__" } };

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
    prisma.tournament.count({ where: { deletedAt: null, ...org } }),
    prisma.tournament.count({ where: { deletedAt: null, status: "ongoing", ...org } }),
    prisma.tournament.count({ where: { deletedAt: null, status: "completed", ...org } }),
    prisma.player.count({ where: { deletedAt: null, ...org } }),
    prisma.team.count({ where: { deletedAt: null, ...org } }),
    prisma.match.findMany({
      where: { deletedAt: null, status: "completed", ...matchOrg },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: matchInclude,
    }),
    prisma.match.findMany({
      where: { deletedAt: null, status: { in: ["scheduled", "in_progress"] }, ...matchOrg },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 5,
      include: matchInclude,
    }),
    prisma.playerRanking.findMany({
      where: playerRankOrg,
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

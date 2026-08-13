import { prisma } from "@/lib/db/prisma";

/**
 * Read-only data for the PUBLIC (no-login) tournament page. Returns null unless
 * the tournament exists and is `public` — so private tournaments are never
 * exposed. Only non-sensitive competition data is selected (names, scores,
 * standings); no emails, no contact info, no cross-tenant data.
 */
export async function getPublicTournamentView(id: string) {
  const t = await prisma.tournament.findFirst({
    where: { id, deletedAt: null, visibility: "public" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      format: true,
      location: true,
      locationLat: true,
      locationLng: true,
      startDate: true,
      endDate: true,
      organizer: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });
  if (!t) return null;

  const [players, standings, matches] = await Promise.all([
    prisma.tournamentPlayer.findMany({
      where: { tournamentId: id, status: "registered" },
      select: { player: { select: { id: true, displayName: true, fullName: true } } },
      orderBy: { registeredAt: "asc" },
    }),
    prisma.leaderboardEntry.findMany({
      where: { tournamentId: id },
      select: {
        wins: true, losses: true, points: true, position: true, rank: true,
        player: { select: { id: true, displayName: true } },
        team: { select: { id: true, name: true } },
      },
    }),
    prisma.match.findMany({
      where: { tournamentId: id, status: "completed", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        winnerSide: true,
        participants: {
          select: { side: true, isWinner: true, gamesWon: true, player: { select: { displayName: true } }, team: { select: { name: true } } },
        },
        games: { select: { scoreA: true, scoreB: true }, orderBy: { gameNumber: "asc" } },
      },
    }),
  ]);

  return {
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    format: t.format,
    location: t.location,
    locationLat: t.locationLat,
    locationLng: t.locationLng,
    startDate: t.startDate,
    endDate: t.endDate,
    organizerName: t.organizer?.name ?? t.organization?.name ?? null,
    players: players.map((p) => p.player),
    standings: standings
      .map((s) => ({
        name: s.team?.name ?? s.player?.displayName ?? "—",
        wins: s.wins,
        losses: s.losses,
        points: s.points,
        position: s.position ?? s.rank ?? null,
      }))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
    matches: matches.map((m) => ({
      id: m.id,
      winnerSide: m.winnerSide,
      sides: (["A", "B"] as const).map((side) => {
        const part = m.participants.find((pp) => pp.side === side);
        return {
          side,
          label: part?.team?.name ?? part?.player?.displayName ?? "TBD",
          isWinner: part?.isWinner ?? false,
          gamesWon: part?.gamesWon ?? 0,
        };
      }),
      games: m.games.map((g) => ({ scoreA: g.scoreA, scoreB: g.scoreB })),
    })),
  };
}

export type PublicTournamentView = NonNullable<Awaited<ReturnType<typeof getPublicTournamentView>>>;

import { prisma } from "@/lib/db/prisma";
import { ELO_START } from "@/lib/engines/elo";

/**
 * Read-only, no-login "viral" player profile. Aggregate numbers come from the
 * maintained ranking (all play); the recent-results / tournament-history detail
 * is limited to PUBLIC tournaments so private events are never exposed. Returns
 * null if the player doesn't exist.
 */
export async function getPublicPlayerProfile(id: string) {
  const player = await prisma.player.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      fullName: true,
      city: true,
      ranking: { select: { wins: true, losses: true, eloRating: true, matchesPlayed: true, tournamentsPlayed: true, titles: true } },
    },
  });
  if (!player) return null;

  const r = player.ranking;
  const wins = r?.wins ?? 0;
  const losses = r?.losses ?? 0;
  const matchesPlayed = r?.matchesPlayed ?? 0;

  // Completed matches the player actually played (singles playerId or doubles
  // snapshot), in PUBLIC tournaments only, newest first.
  const parts = await prisma.matchParticipant.findMany({
    where: {
      OR: [{ playerId: id }, { snapshotPlayers: { some: { playerId: id } } }],
      match: { status: "completed", deletedAt: null, tournament: { deletedAt: null, visibility: "public" } },
    },
    orderBy: { match: { createdAt: "desc" } },
    take: 200,
    select: {
      side: true,
      isWinner: true,
      gamesWon: true,
      match: {
        select: {
          id: true,
          createdAt: true,
          closedAt: true,
          tournament: { select: { id: true, name: true } },
          participants: {
            select: {
              side: true,
              gamesWon: true,
              teamId: true,
              playerId: true,
              team: { select: { name: true } },
              player: { select: { displayName: true } },
              snapshotPlayers: { select: { displayName: true }, orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });

  const sideLabel = (p: { team: { name: string } | null; player: { displayName: string } | null; snapshotPlayers: { displayName: string }[] }) =>
    p.snapshotPlayers.length ? p.snapshotPlayers.map((s) => s.displayName).join(" & ") : p.team?.name ?? p.player?.displayName ?? "TBD";

  // Show the player's full completed-match history for public tournaments (not
  // just the last 10) so a tournament's results are all visible.
  const recentResults = parts.map((p) => {
    const opp = p.match.participants.find((x) => x.side !== p.side) ?? null;
    const mine = p.match.participants.find((x) => x.side === p.side) ?? null;
    return {
      matchId: p.match.id,
      date: (p.match.closedAt ?? p.match.createdAt).toISOString(),
      tournamentId: p.match.tournament.id,
      tournamentName: p.match.tournament.name,
      opponent: opp ? sideLabel(opp) : "—",
      won: p.isWinner,
      score: `${mine?.gamesWon ?? 0}–${opp?.gamesWon ?? 0}`,
    };
  });

  // Current streak = leading run of the same result (newest first).
  const form = parts.map((p) => (p.isWinner ? "W" : "L"));
  let winStreak = 0;
  for (const f of form) {
    if (f === "W") winStreak += 1;
    else break;
  }

  // Public tournaments the player appeared in.
  const tourMap = new Map<string, { id: string; name: string; matches: number }>();
  for (const p of parts) {
    const t = p.match.tournament;
    const e = tourMap.get(t.id) ?? { id: t.id, name: t.name, matches: 0 };
    e.matches += 1;
    tourMap.set(t.id, e);
  }
  const tournamentHistory = [...tourMap.values()];

  // Global rank (on-read) by Elo rating — how many players are rated higher.
  const myRating = r?.eloRating ?? ELO_START;
  // Rank only among rated players (matchesPlayed > 0).
  const all = await prisma.playerRanking.findMany({ where: { matchesPlayed: { gt: 0 } }, select: { eloRating: true } });
  const rank = matchesPlayed > 0 ? 1 + all.filter((x) => x.eloRating > myRating).length : null;

  return {
    id: player.id,
    displayName: player.displayName,
    fullName: player.fullName,
    city: player.city,
    // SmashHero Rating = the player's Elo rating, matching the global leaderboard.
    rating: myRating,
    wins,
    losses,
    matchesPlayed,
    tournamentsPlayed: r?.tournamentsPlayed ?? 0,
    titles: r?.titles ?? 0,
    winStreak,
    rank,
    recentResults,
    tournamentHistory,
  };
}

/**
 * Read-only data for the PUBLIC (no-login) tournament page. Returns null unless
 * the tournament exists and is `public` — so private tournaments are never
 * exposed. Only non-sensitive competition data is selected (names, scores,
 * standings); no emails, no contact info, no cross-tenant data.
 */
/**
 * Public tournament view, resolvable by EITHER the readable `slug` (canonical,
 * SEO) or the raw uuid `id` (legacy / share links). Only public, non-deleted
 * tournaments are returned.
 */
export async function getPublicTournamentView(idOrSlug: string) {
  const t = await prisma.tournament.findFirst({
    where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }], deletedAt: null, visibility: "public" },
    select: {
      id: true,
      slug: true,
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
  const id = t.id; // canonical uuid for the sub-queries (param may be a slug)

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
    slug: t.slug,
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

/**
 * PUBLIC, no-auth browse list for /explore and the sitemap. Returns public,
 * non-deleted tournaments with a light summary + registered-player count,
 * newest first. Cross-tenant by design — only ever public tournaments.
 */
export async function listPublicTournaments(limit = 200) {
  const rows = await prisma.tournament.findMany({
    where: { deletedAt: null, visibility: "public" },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      format: true,
      location: true,
      startDate: true,
      updatedAt: true,
      organizer: { select: { name: true } },
      organization: { select: { name: true } },
      _count: { select: { tournamentPlayers: { where: { status: "registered" } } } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    format: t.format,
    location: t.location,
    startDate: t.startDate,
    updatedAt: t.updatedAt,
    organizerName: t.organizer?.name ?? t.organization?.name ?? null,
    playerCount: t._count.tournamentPlayers,
    href: `/t/${t.slug ?? t.id}`,
  }));
}

/**
 * Everything the public marketing landing page (`/`) needs, in one call:
 * community-scale counts, the current top players (admin excluded), and a few
 * featured public tournaments. No auth, no private data.
 */
export async function getLandingData() {
  const [tournaments, players, matchesPlayed, topRaw, featured] = await Promise.all([
    prisma.tournament.count({ where: { deletedAt: null } }),
    prisma.player.count({ where: { deletedAt: null } }),
    prisma.match.count({ where: { deletedAt: null, status: "completed" } }),
    prisma.playerRanking.findMany({
      where: { matchesPlayed: { gt: 0 }, player: { deletedAt: null, user: { is: { role: { is: { name: { not: "ADMIN" } } } } } } },
      orderBy: [{ eloRating: "desc" }, { winPercentage: "desc" }],
      take: 5,
      select: { playerId: true, wins: true, losses: true, eloRating: true, player: { select: { displayName: true } } },
    }),
    listPublicTournaments(6),
  ]);

  const topPlayers = topRaw.map((r) => ({
    id: r.playerId,
    name: r.player.displayName,
    points: r.eloRating,
    wins: r.wins,
    losses: r.losses,
  }));

  return { stats: { tournaments, players, matchesPlayed }, topPlayers, tournaments: featured };
}

/**
 * Public player ids + last-activity for the sitemap. Only players with a linked
 * account (real, claimable public profiles) and at least one ranking row.
 */
export async function listPublicPlayerIds(limit = 500) {
  const rows = await prisma.player.findMany({
    where: {
      deletedAt: null,
      user: { is: { isActive: true, deletedAt: null, role: { is: { name: { not: "ADMIN" } } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, updatedAt: true },
  });
  return rows;
}

/** In-progress matches + their live scores for a PUBLIC tournament (spectator poll). */
export async function getPublicLiveMatches(id: string) {
  const t = await prisma.tournament.findFirst({
    where: { id, deletedAt: null, visibility: "public" },
    select: { id: true },
  });
  if (!t) return [];
  const matches = await prisma.match.findMany({
    where: { tournamentId: id, status: "in_progress", deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      liveA: true,
      liveB: true,
      participants: { select: { side: true, player: { select: { displayName: true } }, team: { select: { name: true } } } },
    },
  });
  const label = (m: (typeof matches)[number], side: string) => {
    const p = m.participants.find((pp) => pp.side === side);
    return p?.team?.name ?? p?.player?.displayName ?? "TBD";
  };
  return matches.map((m) => ({
    id: m.id,
    a: m.liveA ?? 0,
    b: m.liveB ?? 0,
    sideA: label(m, "A"),
    sideB: label(m, "B"),
  }));
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import type { AuthUser } from "@/lib/auth/authorize";
import { replayElo, eloDelta, eloExpected, ELO_CONFIG, type EloMatchInput } from "@/lib/engines/elo";

/**
 * The Elo Rating Service — the single backend source of truth for ratings.
 *
 * Ratings are materialized per CATEGORY (singles vs doubles, never mixed) on
 * PlayerCategoryRating, with a full audit trail on RatingHistory. Everything is
 * derived from the immutable match history, so it can always be rebuilt.
 *
 * - `applyMatchRating(matchId)` — idempotently apply ONE freshly-completed match
 *   (the common path, keeps score-saving fast). The RatingHistory unique key
 *   guarantees a match never updates a rating twice.
 * - `rebuildAllRatings()` — the admin rebuild: reset and replay every rated match
 *   chronologically (used after history changes: corrections, deletions).
 */

export type RatingCategory = "singles" | "doubles";
export function categoryOf(matchType: string): RatingCategory {
  return matchType === "doubles" ? "doubles" : "singles";
}

const avg = (nums: number[]): number => nums.reduce((s, n) => s + n, 0) / nums.length;

type LoadedMatch = {
  id: string;
  category: RatingCategory;
  sideA: string[];
  sideB: string[];
  winner: "A" | "B";
  playedAt: Date;
};

/** Eligible = completed, not deleted, from a non-deleted TOURNAMENT (point 7 — this
 *  excludes cancelled/pending/deleted/duplicate and casual [no-tournament] matches). */
const ELIGIBLE = { status: "completed", deletedAt: null, tournament: { deletedAt: null } } as const;

function toLoaded(r: {
  id: string; matchType: string; closedAt: Date | null; createdAt: Date;
  participants: { side: string; isWinner: boolean; playerId: string | null; snapshotPlayers: { playerId: string }[] }[];
}): LoadedMatch | null {
  const sideA: string[] = [];
  const sideB: string[] = [];
  let winner: "A" | "B" | null = null;
  for (const p of r.participants) {
    const ids = p.snapshotPlayers.length ? p.snapshotPlayers.map((s) => s.playerId) : p.playerId ? [p.playerId] : [];
    if (p.side === "A") sideA.push(...ids);
    else if (p.side === "B") sideB.push(...ids);
    if (p.isWinner) winner = p.side as "A" | "B";
  }
  if (!sideA.length || !sideB.length || !winner) return null;
  return { id: r.id, category: categoryOf(r.matchType), sideA, sideB, winner, playedAt: r.closedAt ?? r.createdAt };
}

async function loadRatedMatches(): Promise<LoadedMatch[]> {
  const rows = await prisma.match.findMany({
    where: ELIGIBLE,
    select: {
      id: true, matchType: true, closedAt: true, createdAt: true,
      participants: { select: { side: true, isWinner: true, playerId: true, snapshotPlayers: { select: { playerId: true } } } },
    },
    // Deterministic chronological order (date, then id as tie-breaker) — point 15.
    orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toLoaded).filter((m): m is LoadedMatch => m !== null);
}

async function loadOneMatch(matchId: string): Promise<LoadedMatch | null> {
  const r = await prisma.match.findFirst({
    where: { id: matchId, ...ELIGIBLE },
    select: {
      id: true, matchType: true, closedAt: true, createdAt: true,
      participants: { select: { side: true, isWinner: true, playerId: true, snapshotPlayers: { select: { playerId: true } } } },
    },
  });
  return r ? toLoaded(r) : null;
}

/**
 * Full rebuild (point 15): wipe the materialized ratings + history and replay
 * every rated match chronologically, per category. Idempotent and deterministic.
 */
export async function rebuildAllRatings() {
  const matches = await loadRatedMatches();
  const categories: RatingCategory[] = ["singles", "doubles"];

  await prisma.$transaction([prisma.ratingHistory.deleteMany({}), prisma.playerCategoryRating.deleteMany({})]);

  for (const category of categories) {
    const input: EloMatchInput[] = matches
      .filter((m) => m.category === category)
      .map((m) => ({ matchId: m.id, sideA: m.sideA, sideB: m.sideB, winner: m.winner, playedAt: m.playedAt.toISOString() }));
    const res = replayElo(input);

    if (res.history.length) {
      await prisma.ratingHistory.createMany({
        data: res.history.map((h) => ({
          matchId: h.matchId, playerId: h.playerId, category,
          ratingBefore: h.ratingBefore, teamRatingBefore: Math.round(h.teamRatingBefore),
          opponentRatingBefore: Math.round(h.opponentRatingBefore), expectedScore: h.expectedScore,
          actualScore: h.actualScore, k: h.k, ratingChange: h.ratingChange, ratingAfter: h.ratingAfter,
          matchesBefore: h.matchesBefore, playedAt: new Date(h.playedAt),
        })),
      });
    }
    const catRows = [...res.ratings.keys()].map((pid) => ({
      playerId: pid, category, rating: res.ratings.get(pid)!,
      matches: res.matches.get(pid) ?? 0, wins: res.wins.get(pid) ?? 0, losses: res.losses.get(pid) ?? 0,
      lastChange: res.lastChange.get(pid) ?? null,
    }));
    if (catRows.length) await prisma.playerCategoryRating.createMany({ data: catRows });
  }

  await syncPrimaryRatings();
}

/** Platform-admin entry point for the manual rebuild (point 15). */
export async function rebuildRatingsAsAdmin(actor: AuthUser) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden("Only a platform admin can rebuild ratings.");
  await rebuildAllRatings();
  const [players, history] = await Promise.all([
    prisma.playerCategoryRating.count(),
    prisma.ratingHistory.count(),
  ]);
  return { rebuilt: true, categoryRatings: players, historyRows: history };
}

/**
 * Apply ONE freshly-completed match incrementally. Idempotent: if this match is
 * already in RatingHistory it does nothing (point 8 — never update twice). Only
 * valid for a brand-new completion (the latest match); corrections rebuild.
 */
export async function applyMatchRating(matchId: string) {
  if ((await prisma.ratingHistory.count({ where: { matchId } })) > 0) return; // already processed
  const m = await loadOneMatch(matchId);
  if (!m) return;
  const ids = [...new Set([...m.sideA, ...m.sideB])];

  const existing = await prisma.playerCategoryRating.findMany({ where: { playerId: { in: ids }, category: m.category } });
  const cur = new Map(existing.map((c) => [c.playerId, c]));
  const getR = (id: string) => cur.get(id)?.rating ?? ELO_CONFIG.STARTING_RATING;
  const getC = (id: string) => cur.get(id)?.matches ?? 0;

  const teamA = avg(m.sideA.map(getR));
  const teamB = avg(m.sideB.map(getR));
  const anyProvisional = ids.some((id) => getC(id) < ELO_CONFIG.PROVISIONAL_MATCHES);
  const k = anyProvisional ? ELO_CONFIG.PROVISIONAL_K : ELO_CONFIG.ESTABLISHED_K;
  const deltaA = eloDelta(teamA, teamB, m.winner, k);

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const side of ["A", "B"] as const) {
    const sideIds = side === "A" ? m.sideA : m.sideB;
    const teamRating = side === "A" ? teamA : teamB;
    const oppRating = side === "A" ? teamB : teamA;
    const delta = side === "A" ? deltaA : -deltaA;
    const expectedScore = side === "A" ? eloExpected(teamA, teamB) : eloExpected(teamB, teamA);
    const actual = side === m.winner ? 1 : 0;
    for (const id of sideIds) {
      const before = getR(id);
      ops.push(
        prisma.ratingHistory.create({
          data: {
            matchId: m.id, playerId: id, category: m.category, ratingBefore: before,
            teamRatingBefore: Math.round(teamRating), opponentRatingBefore: Math.round(oppRating),
            expectedScore, actualScore: actual, k, ratingChange: delta, ratingAfter: before + delta,
            matchesBefore: getC(id), playedAt: m.playedAt,
          },
        }),
        prisma.playerCategoryRating.upsert({
          where: { playerId_category: { playerId: id, category: m.category } },
          create: { playerId: id, category: m.category, rating: before + delta, matches: 1, wins: actual, losses: 1 - actual, lastChange: delta },
          update: { rating: before + delta, matches: { increment: 1 }, wins: { increment: actual }, losses: { increment: 1 - actual }, lastChange: delta },
        })
      );
    }
  }
  await prisma.$transaction(ops);
  await syncPrimaryRatings(ids);
}

/**
 * Mirror each player's PRIMARY-category rating onto PlayerRanking.eloRating (the
 * headline rating shown outside the leaderboard). Primary = the category with
 * more matches; doubles wins ties. Never mixes the two ratings.
 */
async function syncPrimaryRatings(playerIds?: string[]) {
  const cats = await prisma.playerCategoryRating.findMany({
    where: playerIds ? { playerId: { in: playerIds } } : undefined,
    select: { playerId: true, category: true, rating: true, matches: true },
  });
  const primary = new Map<string, { rating: number; matches: number; category: string }>();
  for (const c of cats) {
    const p = primary.get(c.playerId);
    if (!p || c.matches > p.matches || (c.matches === p.matches && c.category === "doubles")) {
      primary.set(c.playerId, { rating: c.rating, matches: c.matches, category: c.category });
    }
  }
  const rows = await prisma.playerRanking.findMany({
    where: playerIds ? { playerId: { in: playerIds } } : undefined,
    select: { playerId: true },
  });
  if (!rows.length) return;
  const values = Prisma.join(rows.map((r) => Prisma.sql`(${r.playerId}::text, ${primary.get(r.playerId)?.rating ?? ELO_CONFIG.STARTING_RATING}::int)`));
  await prisma.$executeRaw`
    UPDATE "PlayerRanking" AS pr SET "eloRating" = v.elo
    FROM (VALUES ${values}) AS v(player_id, elo)
    WHERE pr."playerId" = v.player_id`;
}

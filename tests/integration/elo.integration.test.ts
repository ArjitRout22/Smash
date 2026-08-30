import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";
import { applyMatchRating, rebuildAllRatings } from "@/lib/services/rating.service";
import { getPlayerLeaderboard } from "@/lib/services/leaderboard.service";
import { ELO_CONFIG } from "@/lib/engines/elo";

const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

const START = ELO_CONFIG.STARTING_RATING;
const K = ELO_CONFIG.PROVISIONAL_K;

async function admin(): Promise<AuthUser> {
  const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
  const user = await prisma.user.create({ data: { email: `elo-${Date.now()}-${Math.round(performance.now())}@smash.test`, name: "Elo Admin", roleId: role.id } });
  return { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
}

async function singlesMatch(actor: AuthUser, a: string, b: string): Promise<string> {
  const t = await createTournament({ name: `Elo ${Date.now()}-${a.slice(0, 4)}`, format: "singles", visibility: "private" }, actor);
  await addTournamentPlayers(t.id, [a, b], actor);
  const match = await createMatch({ tournamentId: t.id, matchType: "singles", bestOf: 1, sideA: { playerId: a }, sideB: { playerId: b } }, actor);
  return match.id;
}

const catRating = (playerId: string, category: string) =>
  prisma.playerCategoryRating.findUnique({ where: { playerId_category: { playerId, category } } });

d("Elo rating system (integration)", () => {
  let actor: AuthUser;
  let A: string, B: string;
  let matchId: string;

  beforeAll(async () => {
    actor = await admin();
    A = (await prisma.player.create({ data: { fullName: "Elo Alice", displayName: "EAlice" } })).id;
    B = (await prisma.player.create({ data: { fullName: "Elo Bob", displayName: "EBob" } })).id;
    matchId = await singlesMatch(actor, A, B);
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 10 }] }, actor); // A wins
  });

  it("materializes a per-category SINGLES rating (±16), separate from doubles", async () => {
    const sa = await catRating(A, "singles");
    const sb = await catRating(B, "singles");
    expect(sa?.rating).toBe(START + 16);
    expect(sb?.rating).toBe(START - 16);
    expect(sa?.matches).toBe(1);
    expect(sa?.wins).toBe(1);
    expect(sa?.lastChange).toBe(16);
    // Doubles is untouched (never mixed).
    expect(await catRating(A, "doubles")).toBeNull();
  });

  it("writes a full, zero-sum rating-history row per player (point 9)", async () => {
    const rows = await prisma.ratingHistory.findMany({ where: { matchId } });
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.playerId === A)!;
    expect(a).toMatchObject({ category: "singles", ratingBefore: START, ratingAfter: START + 16, k: K, actualScore: 1, matchesBefore: 0 });
    expect(a.expectedScore).toBeCloseTo(0.5, 6);
    // Zero-sum: the two players' changes cancel.
    expect(rows.reduce((s, r) => s + r.ratingChange, 0)).toBe(0);
  });

  it("is idempotent — re-applying a processed match never double-counts (point 8)", async () => {
    await applyMatchRating(matchId); // already processed
    const sa = await catRating(A, "singles");
    expect(sa?.rating).toBe(START + 16); // unchanged
    expect(await prisma.ratingHistory.count({ where: { matchId, playerId: A } })).toBe(1);
  });

  it("ranks the singles leaderboard by rating with 2-dp win% and competition ties", async () => {
    // A second independent pair, same shape → C and A tie exactly (1016, 1-0, 100%).
    const C = (await prisma.player.create({ data: { fullName: "Elo Cara", displayName: "ECara" } })).id;
    const Dp = (await prisma.player.create({ data: { fullName: "Elo Dan", displayName: "EDan" } })).id;
    const m2 = await singlesMatch(actor, C, Dp);
    await submitScore(m2, { games: [{ scoreA: 21, scoreB: 5 }] }, actor); // C wins

    // Big page so the shared test DB's accumulated players don't push A/C off page 1.
    const board = await getPlayerLeaderboard(actor, { page: 1, pageSize: 100000, sortDir: "desc" }, { category: "singles" });
    const rowA = board.items.find((r) => r.playerId === A)!;
    const rowC = board.items.find((r) => r.playerId === C)!;
    expect(rowA.points).toBe(1016);
    expect(rowC.points).toBe(1016);
    expect(rowA.winPercentage).toBe(100); // 2 dp, zero-safe
    expect(rowA.rank).toBe(rowC.rank); // exact tie → shared (competition) rank
    // A loser sits below and is still rated (they played).
    const rowB = board.items.find((r) => r.playerId === B)!;
    expect(rowB.points).toBe(984);
    expect(rowB.rank!).toBeGreaterThan(rowA.rank!);
  });

  it("rebuild is deterministic — replaying yields identical ratings", async () => {
    const before = await catRating(A, "singles");
    await rebuildAllRatings();
    const after = await catRating(A, "singles");
    expect(after?.rating).toBe(before?.rating);
    // History is rebuilt, not duplicated (unique key holds).
    expect(await prisma.ratingHistory.count({ where: { matchId, playerId: A } })).toBe(1);
  });
});

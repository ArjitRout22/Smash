import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers, getTournamentLeaderboard, updateTournament } from "@/lib/services/tournament.service";
import { createMatch, updateMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";
import { STANDARD_POINTS_CONFIG, LEAGUE_POINTS_CONFIG } from "@/lib/engines/points";

/**
 * Real service + DB integration for the consistency-critical scoring path.
 * Skipped unless RUN_DB_TESTS=1 and a DATABASE_URL is supplied (a TEST db!).
 *   Example:
 *     createdb badminton_test && DATABASE_URL=...badminton_test npx prisma migrate deploy
 *     RUN_DB_TESTS=1 DATABASE_URL=...badminton_test npx vitest run tests/integration
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("scoring → leaderboard → correction (integration)", () => {
  let actor: AuthUser;
  let tournamentId: string;
  let playerA: string;
  let playerB: string;
  let matchId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN", description: "admin" },
    });
    const user = await prisma.user.create({
      data: { email: `it-${Date.now()}@smash.test`, name: "IT Admin", roleId: role.id },
    });
    actor = {
      id: user.id,
      email: user.email,
      emailVerified: true,
      phone: user.phone,
      name: user.name,
      role: "ADMIN",
      organizationId: null,
      playerId: null,
      permissions: permissionsForRole("ADMIN"),
    };

    const pa = await prisma.player.create({ data: { fullName: "IT Alice", displayName: "Alice" } });
    const pb = await prisma.player.create({ data: { fullName: "IT Bob", displayName: "Bob" } });
    playerA = pa.id;
    playerB = pb.id;

    // This suite verifies the Standard scoring path, so pin it explicitly
    // (new tournaments now default to the League system).
    const t = await createTournament(
      { name: `IT ${Date.now()}`, format: "singles", visibility: "private", pointsConfig: STANDARD_POINTS_CONFIG },
      actor
    );
    tournamentId = t.id;
    await addTournamentPlayers(tournamentId, [playerA, playerB], actor);

    const match = await createMatch(
      {
        tournamentId,
        matchType: "singles",
        bestOf: 3,
        sideA: { playerId: playerA },
        sideB: { playerId: playerB },
      },
      actor
    );
    matchId = match.id;
  });

  afterAll(async () => {
    await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    await prisma.player.deleteMany({ where: { id: { in: [playerA, playerB] } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it("completes a best-of-3 match and updates the leaderboard + ledger", async () => {
    const res = await submitScore(
      matchId,
      { games: [{ scoreA: 21, scoreB: 15 }, { scoreA: 21, scoreB: 18 }] },
      actor
    );
    expect(res.status).toBe("completed");
    expect(res.winnerSide).toBe("A");

    const lb = await getTournamentLeaderboard(actor, tournamentId);
    const alice = lb.find((r) => r.entity?.id === playerA)!;
    const bob = lb.find((r) => r.entity?.id === playerB)!;
    expect(alice.wins).toBe(1);
    expect(alice.points).toBe(10); // matchWin, no stage bonus
    expect(bob.losses).toBe(1);
    expect(bob.points).toBe(2); // matchLoss

    const rankA = await prisma.playerRanking.findUnique({ where: { playerId: playerA } });
    expect(rankA?.wins).toBe(1);
    expect(rankA?.totalPoints).toBe(10);

    const ledger = await prisma.pointTransaction.findMany({ where: { matchId } });
    expect(ledger).toHaveLength(2); // one win row, one loss row
  });

  it("recomputes consistently when the score is corrected (winner flips)", async () => {
    // Completing a match auto-locks it; reopen before correcting the score.
    await updateMatch(matchId, { closed: false }, actor);
    const current = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    const res = await submitScore(
      matchId,
      {
        games: [{ scoreA: 15, scoreB: 21 }, { scoreA: 12, scoreB: 21 }],
        expectedVersion: current.version,
        reason: "scorer entered wrong sides",
      },
      actor
    );
    expect(res.winnerSide).toBe("B");

    const lb = await getTournamentLeaderboard(actor, tournamentId);
    const alice = lb.find((r) => r.entity?.id === playerA)!;
    const bob = lb.find((r) => r.entity?.id === playerB)!;
    expect(bob.wins).toBe(1);
    expect(bob.points).toBe(10);
    expect(alice.wins).toBe(0);
    expect(alice.points).toBe(2);

    const rankA = await prisma.playerRanking.findUnique({ where: { playerId: playerA } });
    const rankB = await prisma.playerRanking.findUnique({ where: { playerId: playerB } });
    expect(rankA?.wins).toBe(0);
    expect(rankB?.wins).toBe(1);
    // Ledger still has exactly two rows for the match (no stale duplicates).
    expect(await prisma.pointTransaction.count({ where: { matchId } })).toBe(2);
  });

  it("rejects a stale (concurrent) score update via optimistic version", async () => {
    // Reopen so the closed-lock guard doesn't mask the optimistic-version check.
    await updateMatch(matchId, { closed: false }, actor);
    await expect(
      submitScore(matchId, { games: [{ scoreA: 21, scoreB: 0 }], expectedVersion: 0 }, actor)
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
  });
});

d("league scoring — default flat 2/0 + optional configurable floor (integration)", () => {
  let actor: AuthUser;
  let tournamentId: string;
  let playerA: string;
  let playerB: string;
  let matchId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `it-lg-${Date.now()}@smash.test`, name: "IT LG", roleId: role.id } });
    actor = {
      id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name,
      role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN"),
    };
    const pa = await prisma.player.create({ data: { fullName: "LG Alice", displayName: "LGA" } });
    const pb = await prisma.player.create({ data: { fullName: "LG Bob", displayName: "LGB" } });
    playerA = pa.id;
    playerB = pb.id;

    // No pointsConfig → should default to the League system.
    const t = await createTournament({ name: `IT LG ${Date.now()}`, format: "singles", visibility: "private" }, actor);
    tournamentId = t.id;
    await addTournamentPlayers(tournamentId, [playerA, playerB], actor);

    const match = await createMatch(
      { tournamentId, matchType: "singles", bestOf: 1, sideA: { playerId: playerA }, sideB: { playerId: playerB } },
      actor
    );
    matchId = match.id;
  });

  afterAll(async () => {
    await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    await prisma.player.deleteMany({ where: { id: { in: [playerA, playerB] } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  async function pointsFor(id: string) {
    const lb = await getTournamentLeaderboard(actor, tournamentId);
    return lb.find((r) => r.entity?.id === id)!.points;
  }

  it("defaults new tournaments to League: flat win = 2, any loss = 0", async () => {
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 16 }] }, actor);
    expect(await pointsFor(playerA)).toBe(2); // win
    expect(await pointsFor(playerB)).toBe(0); // loss (no consolation floor by default)
  });

  it("a heavy loss also earns 0 (no score-based bonus)", async () => {
    await updateMatch(matchId, { closed: false }, actor);
    const cur = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 9 }], expectedVersion: cur.version }, actor);
    expect(await pointsFor(playerA)).toBe(2);
    expect(await pointsFor(playerB)).toBe(0);
  });

  it("honours CUSTOM league point values (win 5 / loss 1)", async () => {
    await updateMatch(matchId, { closed: false }, actor);
    const cur = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 9 }], expectedVersion: cur.version }, actor);
    await updateTournament(
      tournamentId,
      { pointsConfig: { ...LEAGUE_POINTS_CONFIG, matchWin: 5, matchLoss: 1 } },
      actor
    );
    expect(await pointsFor(playerA)).toBe(5);
    expect(await pointsFor(playerB)).toBe(1);
    // reset back to the default flat table for the following tests
    await updateTournament(tournamentId, { pointsConfig: LEAGUE_POINTS_CONFIG }, actor);
  });

  it("honours an OPTIONAL close-loss bonus when the organizer enables one", async () => {
    await updateTournament(
      tournamentId,
      { pointsConfig: { ...LEAGUE_POINTS_CONFIG, lossBonusThreshold: 15, lossBonusPoints: 1 } },
      actor
    );
    // last submitted game was 21–9, so the loser is below the floor → 0
    expect(await pointsFor(playerB)).toBe(0);

    await updateMatch(matchId, { closed: false }, actor);
    const cur = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 15 }], expectedVersion: cur.version }, actor);
    expect(await pointsFor(playerB)).toBe(1); // reached 15 → bonus
    await updateTournament(tournamentId, { pointsConfig: LEAGUE_POINTS_CONFIG }, actor);
  });

  it("switching to Standard rescores the existing standings immediately", async () => {
    await updateMatch(matchId, { closed: false }, actor);
    const cur = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 15 }], expectedVersion: cur.version }, actor);

    await updateTournament(tournamentId, { pointsConfig: STANDARD_POINTS_CONFIG }, actor);
    expect(await pointsFor(playerA)).toBe(10); // matchWin
    expect(await pointsFor(playerB)).toBe(2); // matchLoss

    // …and back to the default League table (flat 2 / 0).
    await updateTournament(tournamentId, { pointsConfig: LEAGUE_POINTS_CONFIG }, actor);
    expect(await pointsFor(playerA)).toBe(2);
    expect(await pointsFor(playerB)).toBe(0);
  });
});

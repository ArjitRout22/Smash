import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers, getTournamentLeaderboard } from "@/lib/services/tournament.service";
import { createMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

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

    const t = await createTournament({ name: `IT ${Date.now()}`, format: "singles" }, actor);
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
    await expect(
      submitScore(matchId, { games: [{ scoreA: 21, scoreB: 0 }], expectedVersion: 0 }, actor)
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
  });
});

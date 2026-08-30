import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createMatch, updateMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";
import { ELO_START } from "@/lib/engines/elo";

/**
 * Verifies the global Elo rating materialises onto PlayerRanking.eloRating — the
 * single number now shown on the Players list, the leaderboard, and profiles.
 * Skipped unless RUN_DB_TESTS=1 with a TEST DATABASE_URL.
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

async function elo(playerId: string): Promise<number> {
  const r = await prisma.playerRanking.findUnique({ where: { playerId }, select: { eloRating: true } });
  return r?.eloRating ?? ELO_START;
}

d("global Elo rating (integration)", () => {
  let actor: AuthUser;
  let playerA: string;
  let playerB: string;
  let tournamentId: string;
  let matchId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN", description: "admin" },
    });
    const user = await prisma.user.create({
      data: { email: `elo-${Date.now()}@smash.test`, name: "Elo Admin", roleId: role.id },
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
    const pa = await prisma.player.create({ data: { fullName: "Elo Alice", displayName: "EAlice" } });
    const pb = await prisma.player.create({ data: { fullName: "Elo Bob", displayName: "EBob" } });
    playerA = pa.id;
    playerB = pb.id;

    const t = await createTournament(
      { name: `Elo ${Date.now()}`, format: "singles", visibility: "private" },
      actor
    );
    tournamentId = t.id;
    await addTournamentPlayers(tournamentId, [playerA, playerB], actor);
    const match = await createMatch(
      { tournamentId, matchType: "singles", bestOf: 1, sideA: { playerId: playerA }, sideB: { playerId: playerB } },
      actor
    );
    matchId = match.id;
  });

  it("a fresh win moves the winner above 1000 and the loser below, mirrored", async () => {
    // Alice beats Bob 21-10.
    await submitScore(matchId, { games: [{ scoreA: 21, scoreB: 10 }] }, actor);

    const a = await elo(playerA);
    const b = await elo(playerB);
    expect(a).toBeGreaterThan(ELO_START);
    expect(b).toBeLessThan(ELO_START);
    // From equal ratings the swing is K/2 = 16 each, and it's zero-sum.
    expect(a).toBe(ELO_START + 16);
    expect(b).toBe(ELO_START - 16);
    expect(a + b).toBe(2 * ELO_START);
  });

  it("correcting the result (Bob wins instead) flips the ratings via a full replay", async () => {
    // A completed match auto-closes, so reopen it, then re-score the other way —
    // a correction (previous status = completed) triggers the full Elo replay.
    await updateMatch(matchId, { closed: false }, actor);
    await submitScore(matchId, { games: [{ scoreA: 12, scoreB: 21 }] }, actor);

    const a = await elo(playerA);
    const b = await elo(playerB);
    expect(b).toBe(ELO_START + 16);
    expect(a).toBe(ELO_START - 16);
  });
});

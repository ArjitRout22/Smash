import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers, updateTournament } from "@/lib/services/tournament.service";
import { createTeam } from "@/lib/services/team.service";
import { generateFixtures } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

/**
 * A "title" is won by the #1 team/player in a COMPLETED tournament's standings —
 * including round-robin/group (no knockout final). Every player on the winning
 * team gets +1 title. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("tournament titles (integration)", () => {
  let actor: AuthUser;
  const tournamentIds: string[] = [];
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `title-${Date.now()}@smash.test`, name: "Title Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
  });
  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it("round-robin winner's team players each get a title when the tournament completes", async () => {
    const t = await createTournament({ name: `Title ${Date.now()}`, format: "doubles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    const teams: { id: string; players: string[] }[] = [];
    for (let ti = 0; ti < 2; ti++) {
      const p1 = await prisma.player.create({ data: { fullName: `TT${ti}P1`, displayName: `TT${ti}P1` } });
      const p2 = await prisma.player.create({ data: { fullName: `TT${ti}P2`, displayName: `TT${ti}P2` } });
      playerIds.push(p1.id, p2.id);
      await addTournamentPlayers(t.id, [p1.id, p2.id], actor);
      const team = await createTeam({ name: `Team ${ti}`, teamType: "doubles", tournamentId: t.id, playerIds: [p1.id, p2.id] }, actor);
      teams.push({ id: team.id, players: [p1.id, p2.id] });
    }

    await generateFixtures(t.id, { stageName: "RR", matchType: "doubles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: teams.map((x) => x.id) }, actor);
    const match = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id }, include: { participants: true } });
    const winnerTeamId = match.participants.find((p) => p.side === "A")!.teamId!;
    const winner = teams.find((x) => x.id === winnerTeamId)!;
    const loser = teams.find((x) => x.id !== winnerTeamId)!;

    // Side A wins the only match.
    await submitScore(match.id, { games: [{ scoreA: 21, scoreB: 10 }] }, actor);

    // Not completed yet → no titles.
    const before = await prisma.playerRanking.findMany({ where: { playerId: { in: winner.players } } });
    expect(before.every((r) => r.titles === 0)).toBe(true);

    // Complete the tournament (upcoming → ongoing → completed).
    await updateTournament(t.id, { status: "ongoing" }, actor);
    await updateTournament(t.id, { status: "completed" }, actor);

    const winRanks = await prisma.playerRanking.findMany({ where: { playerId: { in: winner.players } } });
    expect(winRanks).toHaveLength(2);
    expect(winRanks.every((r) => r.titles === 1)).toBe(true);

    const loseRanks = await prisma.playerRanking.findMany({ where: { playerId: { in: loser.players } } });
    expect(loseRanks.every((r) => r.titles === 0)).toBe(true);
  });
});

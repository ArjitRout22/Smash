import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers, updateTournament } from "@/lib/services/tournament.service";
import { createTeam } from "@/lib/services/team.service";
import { generateFixtures } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";
import { getPlayerInsights, getPlayerTournaments } from "@/lib/services/player.service";

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

    // A DOUBLES player's recent form + tournament history must include the match
    // (matched via the snapshot / team, not just playerId).
    const insights = await getPlayerInsights(actor, winner.players[0]);
    expect(insights.last5.length).toBeGreaterThan(0);
    const history = await getPlayerTournaments(actor, winner.players[0]);
    expect(history.some((h) => h.tournament.id === t.id)).toBe(true);

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

  it("group stage: EVERY player in the winning group gets a title (not just the top team)", async () => {
    const t = await createTournament({ name: `Grp ${Date.now()}`, format: "doubles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    const mkTeam = async (name: string) => {
      const p1 = await prisma.player.create({ data: { fullName: `${name} P1`, displayName: `${name}P1` } });
      const p2 = await prisma.player.create({ data: { fullName: `${name} P2`, displayName: `${name}P2` } });
      playerIds.push(p1.id, p2.id);
      await addTournamentPlayers(t.id, [p1.id, p2.id], actor);
      const team = await createTeam({ name, teamType: "doubles", tournamentId: t.id, playerIds: [p1.id, p2.id] }, actor);
      return { id: team.id, players: [p1.id, p2.id] };
    };
    // Group A = 1 team; Group B = 2 teams. Group B will win both cross matches.
    const A = await mkTeam("GA");
    const B1 = await mkTeam("GB1");
    const B2 = await mkTeam("GB2");

    await generateFixtures(t.id, { stageName: "Groups", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [[A.id], [B1.id, B2.id]] }, actor);

    // Side A is always the Group A team; score so the Group B side wins both.
    const matches = await prisma.match.findMany({ where: { tournamentId: t.id }, orderBy: { createdAt: "asc" } });
    expect(matches).toHaveLength(2);
    for (const m of matches) await submitScore(m.id, { games: [{ scoreA: 10, scoreB: 21 }] }, actor);

    await updateTournament(t.id, { status: "ongoing" }, actor);
    await updateTournament(t.id, { status: "completed" }, actor);

    // Both winning-group teams' players get a title — including B2, which isn't the
    // single top-ranked team.
    const winners = await prisma.playerRanking.findMany({ where: { playerId: { in: [...B1.players, ...B2.players] } } });
    expect(winners).toHaveLength(4);
    expect(winners.every((r) => r.titles === 1)).toBe(true);
    // The losing group's players get nothing.
    const losers = await prisma.playerRanking.findMany({ where: { playerId: { in: A.players } } });
    expect(losers.every((r) => r.titles === 0)).toBe(true);
  });
});

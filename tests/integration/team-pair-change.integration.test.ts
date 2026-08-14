import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam, changeTeamPair, setTeamLock } from "@/lib/services/team.service";
import { createMatch, getMatch, updateMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

/**
 * Team identity stays stable; membership can change; match player snapshots never
 * change after a match starts. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("team pair change + match snapshots (integration)", () => {
  let actor: AuthUser;
  let tId: string;
  let team1: string;
  let team2: string;
  const P: Record<string, string> = {}; // name → playerId
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `pc-${Date.now()}@smash.test`, name: "PC Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };

    const t = await createTournament({ name: `PC ${Date.now()}`, format: "doubles", visibility: "private" }, actor);
    tId = t.id;
    for (const name of ["A", "B", "C", "D", "E"]) {
      const p = await prisma.player.create({ data: { fullName: `PC ${name}`, displayName: name } });
      P[name] = p.id;
      playerIds.push(p.id);
    }
    await addTournamentPlayers(tId, playerIds, actor);
    team1 = (await createTeam({ name: "Team 1", teamType: "doubles", tournamentId: tId, playerIds: [P.A, P.B] }, actor)).id;
    team2 = (await createTeam({ name: "Team 2", teamType: "doubles", tournamentId: tId, playerIds: [P.C, P.D] }, actor)).id;
  });

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: tId } });
    await prisma.tournament.deleteMany({ where: { id: tId } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  const names = (m: Awaited<ReturnType<typeof getMatch>>, side: 0 | 1) =>
    m.sides[side].players.map((p) => p.displayName).sort();

  async function newMatch() {
    return createMatch({ tournamentId: tId, matchType: "doubles", bestOf: 1, sideA: { teamId: team1 }, sideB: { teamId: team2 } }, actor);
  }

  it("snapshots the current pair at match creation", async () => {
    const m = await getMatch(actor, (await newMatch()).id);
    expect(names(m, 0)).toEqual(["A", "B"]);
  });

  it("a completed match keeps its original players; a scheduled one follows the change", async () => {
    const played = await newMatch(); // will be COMPLETED, snapshot A+B
    await submitScore(played.id, { games: [{ scoreA: 21, scoreB: 18 }] }, actor); // Team 1 wins
    const scheduled = await newMatch(); // stays SCHEDULED

    // B out, E in — team identity (team1) unchanged.
    await changeTeamPair(actor, team1, { outPlayerId: P.B, inPlayerId: P.E, reason: "B unavailable" });

    expect(names(await getMatch(actor, played.id), 0)).toEqual(["A", "B"]); // frozen
    expect(names(await getMatch(actor, scheduled.id), 0)).toEqual(["A", "E"]); // updated

    // Team 1 now A + E, but its fixtures still reference team1.
    const members = await prisma.teamPlayer.findMany({ where: { teamId: team1, status: "active" }, select: { playerId: true } });
    expect(new Set(members.map((x) => x.playerId))).toEqual(new Set([P.A, P.E]));

    // Stats: B keeps the win from the completed match; E earned nothing yet.
    const bRank = await prisma.playerRanking.findUnique({ where: { playerId: P.B } });
    expect(bRank?.wins).toBe(1);
    const eRank = await prisma.playerRanking.findUnique({ where: { playerId: P.E } });
    expect(eRank?.wins ?? 0).toBe(0);
  });

  it("blocks a change while the team has a live match", async () => {
    const m = await newMatch();
    await updateMatch(m.id, { status: "in_progress" }, actor);
    await expect(changeTeamPair(actor, team1, { outPlayerId: P.A, inPlayerId: P.C })).rejects.toMatchObject({ code: "CONFLICT" });
    await updateMatch(m.id, { status: "cancelled" }, actor); // reset for later tests
  });

  it("swaps places when the replacement is already on another team", async () => {
    // team1 = A + E, team2 = C + D. Replace A with C → the two swap teams.
    const after = await changeTeamPair(actor, team1, { outPlayerId: P.A, inPlayerId: P.C });
    expect(after.teamPlayers.map((tp) => tp.player.id).sort()).toEqual([P.C, P.E].sort());
    const t2 = await prisma.teamPlayer.findMany({ where: { teamId: team2, status: "active" }, select: { playerId: true } });
    expect(new Set(t2.map((x) => x.playerId))).toEqual(new Set([P.A, P.D])); // both teams stay complete pairs
  });

  it("a locked team needs force to change", async () => {
    // team1 = C + E now; B is unassigned.
    await setTeamLock(actor, team1, true);
    await expect(changeTeamPair(actor, team1, { outPlayerId: P.C, inPlayerId: P.B })).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await changeTeamPair(actor, team1, { outPlayerId: P.C, inPlayerId: P.B, force: true });
    expect(after.teamPlayers.map((tp) => tp.player.id).sort()).toEqual([P.B, P.E].sort());
    await setTeamLock(actor, team1, false);
  });
});

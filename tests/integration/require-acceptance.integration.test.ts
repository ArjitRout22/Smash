import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam, createRandomTeams } from "@/lib/services/team.service";
import { generateFixtures } from "@/lib/services/match.service";

/**
 * "Require acceptance" opt-out (items 5 + 6):
 *  - When a tournament requires acceptance (the default), a still-pending
 *    ("invited") player/team can't be put into fixtures.
 *  - When it doesn't, pending players ARE eligible — but a DECLINED player never
 *    is (rejecting an invite always keeps them out).
 *  - Committing a pending player to a fixture promotes their invite to a
 *    confirmed participant, so the stale "pending invite" notification clears.
 * DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("require-acceptance opt-out (integration)", () => {
  let actor: AuthUser;
  const tournamentIds: string[] = [];
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `ra-${Date.now()}@smash.test`, name: "RA Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
  });

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  async function mkPlayer(tag: string) {
    const p = await prisma.player.create({ data: { fullName: `RA ${tag}`, displayName: tag } });
    playerIds.push(p.id);
    return p.id;
  }

  async function singlesTournament(requireAcceptance: boolean) {
    const t = await createTournament({ name: `RA ${Date.now()}-${Math.round(performance.now())}`, format: "singles", visibility: "private", requireAcceptance }, actor);
    tournamentIds.push(t.id);
    return t.id;
  }

  it("default (require acceptance): a pending invite can't be scheduled", async () => {
    const id = await singlesTournament(true);
    const a = await mkPlayer("A1");
    const b = await mkPlayer("B1");
    await addTournamentPlayers(id, [a], actor); // registered
    await prisma.tournamentPlayer.create({ data: { tournamentId: id, playerId: b, status: "invited" } });

    await expect(
      generateFixtures(id, { matchType: "singles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: [a, b] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG" });
  });

  it("acceptance off: a pending player IS scheduled, and its invite is cleared", async () => {
    const id = await singlesTournament(false);
    const a = await mkPlayer("A2");
    const b = await mkPlayer("B2");
    await addTournamentPlayers(id, [a], actor); // registered
    await prisma.tournamentPlayer.create({ data: { tournamentId: id, playerId: b, status: "invited" } });

    const res = await generateFixtures(id, { matchType: "singles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: [a, b] }, actor);
    expect(res.created).toBe(1);

    // Item 6: the pending invite is promoted to a confirmed participant.
    const row = await prisma.tournamentPlayer.findUniqueOrThrow({ where: { tournamentId_playerId: { tournamentId: id, playerId: b } } });
    expect(row.status).toBe("registered");
  });

  it("acceptance off: a DECLINED player still can't be scheduled", async () => {
    const id = await singlesTournament(false);
    const a = await mkPlayer("A3");
    const b = await mkPlayer("B3");
    await addTournamentPlayers(id, [a], actor);
    await prisma.tournamentPlayer.create({ data: { tournamentId: id, playerId: b, status: "declined" } });

    await expect(
      generateFixtures(id, { matchType: "singles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: [a, b] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG" });
  });

  it("acceptance off (doubles): a team with a pending member plays, member becomes active", async () => {
    const t = await createTournament({ name: `RA D ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private", requireAcceptance: false }, actor);
    tournamentIds.push(t.id);

    // Two complete teams; on team 0, one member is still "invited" (pending).
    const teamIds: string[] = [];
    let pendingPlayerId = "";
    for (let ti = 0; ti < 2; ti++) {
      const p1 = await mkPlayer(`DT${ti}P1`);
      const p2 = await mkPlayer(`DT${ti}P2`);
      await addTournamentPlayers(t.id, [p1, p2], actor);
      const team = await createTeam({ name: `D Team ${ti}`, teamType: "doubles", tournamentId: t.id, playerIds: [p1, p2] }, actor);
      teamIds.push(team.id);
      if (ti === 0) {
        pendingPlayerId = p2;
        await prisma.teamPlayer.updateMany({ where: { teamId: team.id, playerId: p2 }, data: { status: "invited" } });
      }
    }

    const res = await generateFixtures(t.id, { matchType: "doubles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: teamIds }, actor);
    expect(res.created).toBe(1);

    // Item 6: the pending team member is promoted to active.
    const tp = await prisma.teamPlayer.findFirstOrThrow({ where: { teamId: teamIds[0], playerId: pendingPlayerId } });
    expect(tp.status).toBe("active");
  });

  it("acceptance off: random teams include a still-pending player; declined excluded", async () => {
    const t = await createTournament({ name: `RA RT ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private", requireAcceptance: false }, actor);
    tournamentIds.push(t.id);
    // 2 registered + 1 pending + 1 declined = 3 eligible → 1 doubles team, 1 unassigned.
    const reg1 = await mkPlayer("RTreg1");
    const reg2 = await mkPlayer("RTreg2");
    const pending = await mkPlayer("RTpend");
    const declined = await mkPlayer("RTdecl");
    await addTournamentPlayers(t.id, [reg1, reg2], actor);
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, playerId: pending, status: "invited" } });
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, playerId: declined, status: "declined" } });

    const res = await createRandomTeams(actor, t.id);
    // 3 eligible players → exactly 1 pair; the declined player is never considered.
    expect(res.created).toBe(1);
    const teamed = new Set(res.teams.flatMap((tm) => tm.teamPlayers.map((m) => m.playerId)));
    expect(teamed.has(declined)).toBe(false);
    // The leftover is one of the 3 eligible, never the declined player.
    expect(res.unassigned.every((u) => u.id !== declined)).toBe(true);
  });

  it("default: a manual team with a still-pending player is rejected", async () => {
    const t = await createTournament({ name: `RA MT ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private", requireAcceptance: true }, actor);
    tournamentIds.push(t.id);
    const reg = await mkPlayer("MTreg");
    const pending = await mkPlayer("MTpend");
    await addTournamentPlayers(t.id, [reg], actor);
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, playerId: pending, status: "invited" } });

    await expect(
      createTeam({ name: "Mixed pending", teamType: "doubles", tournamentId: t.id, playerIds: [reg, pending] }, actor)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("acceptance off: a manual team with a still-pending player is allowed (member active)", async () => {
    const t = await createTournament({ name: `RA MT2 ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private", requireAcceptance: false }, actor);
    tournamentIds.push(t.id);
    const reg = await mkPlayer("MT2reg");
    const pending = await mkPlayer("MT2pend");
    await addTournamentPlayers(t.id, [reg], actor);
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, playerId: pending, status: "invited" } });

    const team = await createTeam({ name: "Pending OK", teamType: "doubles", tournamentId: t.id, playerIds: [reg, pending] }, actor);
    const members = await prisma.teamPlayer.findMany({ where: { teamId: team.id } });
    expect(members).toHaveLength(2);
    expect(members.every((m) => m.status === "active")).toBe(true);
  });
});

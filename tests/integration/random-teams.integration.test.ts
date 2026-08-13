import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam, createRandomTeams } from "@/lib/services/team.service";

/**
 * Random doubles team generation: pairs unassigned registered players 2-per-team,
 * excludes already-assigned players, leaves an odd player unassigned, and refuses
 * when fewer than 2 are available. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("random doubles teams (integration)", () => {
  let actor: AuthUser;
  const tournamentIds: string[] = [];
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `rt-${Date.now()}@smash.test`, name: "RT Admin", roleId: role.id } });
    actor = {
      id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name,
      role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN"),
    };
  });

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  async function tournamentWith(n: number): Promise<{ id: string; players: string[] }> {
    const t = await createTournament({ name: `RT ${Date.now()}-${n}`, format: "doubles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await prisma.player.create({ data: { fullName: `RT P${i}`, displayName: `P${i}` } });
      ids.push(p.id);
      playerIds.push(p.id);
    }
    await addTournamentPlayers(t.id, ids, actor);
    return { id: t.id, players: ids };
  }

  it("pairs 6 players into 3 doubles teams with none left over", async () => {
    const { id } = await tournamentWith(6);
    const res = await createRandomTeams(actor, id);
    expect(res.created).toBe(3);
    expect(res.unassigned).toHaveLength(0);
    // Every team is a doubles pair, and each player is used exactly once.
    const used = res.teams.flatMap((t) => t.teamPlayers.map((tp) => tp.player.id));
    expect(res.teams.every((t) => t.teamPlayers.length === 2)).toBe(true);
    expect(new Set(used).size).toBe(6);
    expect(res.teams.every((t) => t.teamType === "doubles")).toBe(true);
  });

  it("leaves one player unassigned for an odd count (5 → 2 teams + 1 spare)", async () => {
    const { id } = await tournamentWith(5);
    const res = await createRandomTeams(actor, id);
    expect(res.created).toBe(2);
    expect(res.unassigned).toHaveLength(1);
  });

  it("excludes players already on a team and leaves existing teams untouched", async () => {
    const { id, players } = await tournamentWith(6);
    const manual = await createTeam({ name: "Manual", teamType: "doubles", tournamentId: id, playerIds: [players[0], players[1]] }, actor);
    const res = await createRandomTeams(actor, id);
    // 4 remaining → 2 random teams; the manual team is not among them.
    expect(res.created).toBe(2);
    const randomPlayerIds = new Set(res.teams.flatMap((t) => t.teamPlayers.map((tp) => tp.player.id)));
    expect(randomPlayerIds.has(players[0])).toBe(false);
    expect(randomPlayerIds.has(players[1])).toBe(false);
    const total = await prisma.team.count({ where: { tournamentId: id, deletedAt: null } });
    expect(total).toBe(3); // manual + 2 random
    expect(res.teams.some((t) => t.id === manual.id)).toBe(false);
  });

  it("refuses when fewer than 2 players are unassigned", async () => {
    const { id } = await tournamentWith(1);
    await expect(createRandomTeams(actor, id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

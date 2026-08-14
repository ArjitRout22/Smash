import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, getTournament, addScorer, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam, updateTeam, listTeams } from "@/lib/services/team.service";

/**
 * Permission rules:
 *  - Renaming a team is platform-admin only (others → FORBIDDEN).
 *  - getTournament().canScore is true only for the organizer/creator, a platform
 *    admin, or a nominated scorer (mirrors assertCanScoreTournament) — the UI
 *    uses it to disable score controls for everyone else.
 * DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("team-rename + scoring permissions (integration)", () => {
  let orgId: string;
  let admin: AuthUser;
  let organizer: AuthUser; // owns the tournament
  let otherManager: AuthUser; // same org, but not organizer/creator/scorer
  let scorer: AuthUser; // a PLAYER-role user we'll nominate
  const cleanupUserIds: string[] = [];
  const cleanupPlayerIds: string[] = [];
  const tournamentIds: string[] = [];
  const extraOrgIds: string[] = [];

  const mkUser = async (role: string, organizationId: string | null, playerId: string | null = null): Promise<AuthUser> => {
    await prisma.role.upsert({ where: { name: role }, update: {}, create: { name: role, description: role } });
    const u = await prisma.user.create({ data: { email: `perm-${role}-${Date.now()}-${Math.round(performance.now())}@smash.test`, name: role, roleId: (await prisma.role.findUniqueOrThrow({ where: { name: role } })).id, organizationId, playerId } });
    cleanupUserIds.push(u.id);
    return { id: u.id, email: u.email, emailVerified: true, phone: u.phone, name: u.name, role, organizationId, playerId, permissions: permissionsForRole(role) };
  };

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Perm Org ${Date.now()}`, slug: `perm-org-${Date.now()}-${Math.round(performance.now())}` } });
    orgId = org.id;
    admin = await mkUser("ADMIN", null);
    organizer = await mkUser("ORGANIZER", orgId);
    otherManager = await mkUser("ORGANIZER", orgId);
    const sp = await prisma.player.create({ data: { fullName: "Scorer Player", displayName: "Scorer", organizationId: orgId } });
    cleanupPlayerIds.push(sp.id);
    scorer = await mkUser("PLAYER", orgId, sp.id);
    await prisma.player.update({ where: { id: sp.id }, data: { user: { connect: { id: scorer.id } } } });
  });

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournamentScorer.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.player.deleteMany({ where: { id: { in: cleanupPlayerIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, ...extraOrgIds] } } });
    await prisma.$disconnect();
  });

  async function teamInOrg() {
    const t = await createTournament({ name: `Perm T ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private" }, organizer);
    tournamentIds.push(t.id);
    const p1 = await prisma.player.create({ data: { fullName: "P1", displayName: "P1", organizationId: orgId } });
    const p2 = await prisma.player.create({ data: { fullName: "P2", displayName: "P2", organizationId: orgId } });
    cleanupPlayerIds.push(p1.id, p2.id);
    // Register + team (createTeam without tournament so no registration needed).
    const team = await createTeam({ name: "Original", teamType: "doubles", playerIds: [p1.id, p2.id] }, organizer);
    return { tournamentId: t.id, teamId: team.id };
  }

  // --- Task 2: rename is admin-only ----------------------------------------
  it("a non-admin (organizer) cannot rename a team", async () => {
    const { teamId } = await teamInOrg();
    await expect(updateTeam(teamId, { name: "Hacked" }, organizer)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const row = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(row.name).toBe("Original");
  });

  it("a platform admin can rename a team", async () => {
    const { teamId } = await teamInOrg();
    const updated = await updateTeam(teamId, { name: "Renamed by Admin" }, admin);
    expect(updated.name).toBe("Renamed by Admin");
  });

  // --- Task 4: canScore is organizer/admin/nominated-scorer only ------------
  it("canScore true for organizer and admin, false for a plain same-org manager", async () => {
    const t = await createTournament({ name: `Score T ${Date.now()}`, format: "doubles", visibility: "private" }, organizer);
    tournamentIds.push(t.id);

    expect((await getTournament(organizer, t.id)).canScore).toBe(true);
    expect((await getTournament(admin, t.id)).canScore).toBe(true);
    // otherManager can MANAGE (same org) but must NOT be able to score.
    const asOther = await getTournament(otherManager, t.id);
    expect(asOther.canManage).toBe(true);
    expect(asOther.canScore).toBe(false);
  });

  it("canScore becomes true once a player is nominated as a scorer", async () => {
    const t = await createTournament({ name: `Score T2 ${Date.now()}`, format: "doubles", visibility: "private" }, organizer);
    tournamentIds.push(t.id);

    expect((await getTournament(scorer, t.id)).canScore).toBe(false);
    await addScorer(organizer, t.id, scorer.playerId!);
    expect((await getTournament(scorer, t.id)).canScore).toBe(true);
  });

  // --- Teams visible to a viewer outside the org (public tournament) --------
  it("a viewer in a different org can see a PUBLIC tournament's teams (read-only)", async () => {
    const t = await createTournament({ name: `Pub ${Date.now()}`, format: "doubles", visibility: "public" }, organizer);
    tournamentIds.push(t.id);
    const p1 = await prisma.player.create({ data: { fullName: "PP1", displayName: "PP1", organizationId: orgId } });
    const p2 = await prisma.player.create({ data: { fullName: "PP2", displayName: "PP2", organizationId: orgId } });
    cleanupPlayerIds.push(p1.id, p2.id);
    await addTournamentPlayers(t.id, [p1.id, p2.id], organizer);
    await createTeam({ name: "Visible Team", teamType: "doubles", tournamentId: t.id, playerIds: [p1.id, p2.id] }, organizer);

    const org2 = await prisma.organization.create({ data: { name: `Org2 ${Date.now()}`, slug: `org2-${Date.now()}-${Math.round(performance.now())}` } });
    extraOrgIds.push(org2.id);
    const outsider = await mkUser("ORGANIZER", org2.id);

    const teams = await listTeams(outsider, { tournamentId: t.id });
    expect(teams.map((x) => x.name)).toContain("Visible Team");
  });

  // --- At-a-glance counts exclude soft-deleted matches ----------------------
  it("getTournament match count excludes soft-deleted matches", async () => {
    const t = await createTournament({ name: `Count ${Date.now()}`, format: "doubles", visibility: "private" }, organizer);
    tournamentIds.push(t.id);
    const m1 = await prisma.match.create({ data: { tournamentId: t.id, matchType: "doubles", bestOf: 1, status: "scheduled" } });
    const m2 = await prisma.match.create({ data: { tournamentId: t.id, matchType: "doubles", bestOf: 1, status: "scheduled" } });
    expect((await getTournament(organizer, t.id))._count.matches).toBe(2);
    await prisma.match.updateMany({ where: { id: { in: [m1.id, m2.id] } }, data: { deletedAt: new Date() } });
    expect((await getTournament(organizer, t.id))._count.matches).toBe(0);
  });
});

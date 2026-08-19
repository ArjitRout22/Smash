import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import type { Pagination } from "@/lib/api/pagination";
import { listPlayers } from "@/lib/services/player.service";

/**
 * The platform admin is an operator, not a participant: its player profile must
 * never appear in another user's global directory / invite picker. The admin
 * itself still sees everyone. Gated behind RUN_DB_TESTS=1.
 */
const d = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const PAGE: Pagination = { page: 1, pageSize: 200, sortDir: "asc" };

d("platform admin hidden from other users' directory (integration)", () => {
  let adminActor: AuthUser;
  let orgActor: AuthUser;
  let adminPlayerId: string;
  let orgPlayerId: string;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const adminRole = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const orgRole = await prisma.role.upsert({ where: { name: "ORGANIZER" }, update: {}, create: { name: "ORGANIZER", description: "org" } });

    const adminPlayer = await prisma.player.create({ data: { fullName: `AV Admin ${stamp}`, displayName: `AVAdmin${stamp}` } });
    adminPlayerId = adminPlayer.id;
    const adminUser = await prisma.user.create({
      data: { email: `av-admin-${stamp}@smash.test`, name: "AV Admin", roleId: adminRole.id, playerId: adminPlayer.id },
    });

    const org = await prisma.organization.create({ data: { name: `AV Club ${stamp}`, slug: `av-${stamp}` } });
    const orgPlayer = await prisma.player.create({ data: { fullName: `AV Org ${stamp}`, displayName: `AVOrg${stamp}`, organizationId: org.id } });
    orgPlayerId = orgPlayer.id;
    const orgUser = await prisma.user.create({
      data: { email: `av-org-${stamp}@smash.test`, name: "AV Org", roleId: orgRole.id, organizationId: org.id, playerId: orgPlayer.id },
    });

    adminActor = {
      id: adminUser.id, email: adminUser.email, emailVerified: true, phone: null, name: adminUser.name,
      role: "ADMIN", organizationId: null, playerId: adminPlayer.id, permissions: permissionsForRole("ADMIN"),
    };
    orgActor = {
      id: orgUser.id, email: orgUser.email, emailVerified: true, phone: null, name: orgUser.name,
      role: "ORGANIZER", organizationId: org.id, playerId: orgPlayer.id, permissions: permissionsForRole("ORGANIZER"),
    };
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [`av-admin-${stamp}@smash.test`, `av-org-${stamp}@smash.test`] } } });
    await prisma.player.deleteMany({ where: { id: { in: [adminPlayerId, orgPlayerId] } } });
    await prisma.organization.deleteMany({ where: { slug: `av-${stamp}` } });
    await prisma.$disconnect();
  });

  it("a non-admin's global directory excludes the platform admin", async () => {
    const { items } = await listPlayers(orgActor, PAGE, { scope: "all" });
    const ids = items.map((p) => p.id);
    expect(ids).toContain(orgPlayerId); // regular players still show
    expect(ids).not.toContain(adminPlayerId); // admin is hidden
  });

  it("the admin itself still sees everyone (including its own profile)", async () => {
    const { items } = await listPlayers(adminActor, PAGE, { scope: "all" });
    const ids = items.map((p) => p.id);
    expect(ids).toContain(adminPlayerId);
    expect(ids).toContain(orgPlayerId);
  });
});

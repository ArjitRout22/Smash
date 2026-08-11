import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import type { Pagination } from "@/lib/api/pagination";
import {
  createTournament,
  getTournament,
  listTournaments,
} from "@/lib/services/tournament.service";
import { createPlayer, getPlayer, listPlayers } from "@/lib/services/player.service";

/**
 * Multi-tenant isolation: a user in workspace A must never be able to see or
 * reach data in workspace B — not via list queries, not by guessing an id.
 * Gated behind RUN_DB_TESTS=1 (needs a TEST database).
 */
const d = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const PAGE: Pagination = { page: 1, pageSize: 50, sortDir: "desc" };

async function makeOrganizer(label: string): Promise<AuthUser> {
  const role = await prisma.role.upsert({
    where: { name: "ORGANIZER" },
    update: {},
    create: { name: "ORGANIZER", description: "org owner" },
  });
  const org = await prisma.organization.create({
    data: { name: `${label} Club`, slug: `${label}-${Date.now()}-${Math.round(Math.random() * 1e6)}` },
  });
  const user = await prisma.user.create({
    data: { email: `${label}-${Date.now()}@t.test`, name: label, roleId: role.id, organizationId: org.id },
  });
  return {
    id: user.id,
    email: user.email,
    emailVerified: true,
    phone: null,
    name: user.name,
    role: "ORGANIZER",
    organizationId: org.id,
    playerId: null,
    permissions: permissionsForRole("ORGANIZER"),
  };
}

d("multi-tenant isolation", () => {
  let alice: AuthUser;
  let bob: AuthUser;
  let aliceTournamentId: string;
  let alicePlayerId: string;

  beforeAll(async () => {
    alice = await makeOrganizer("alice");
    bob = await makeOrganizer("bob");
    const t = await createTournament({ name: "Alice Open", format: "singles", visibility: "private" }, alice);
    aliceTournamentId = t.id;
    const p = await createPlayer({ fullName: "Alice Player" }, alice);
    alicePlayerId = p.id;
  });

  afterAll(async () => {
    await prisma.tournament.deleteMany({ where: { organizationId: { in: [alice.organizationId!, bob.organizationId!] } } });
    await prisma.player.deleteMany({ where: { organizationId: { in: [alice.organizationId!, bob.organizationId!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [alice.organizationId!, bob.organizationId!] } } });
    await prisma.$disconnect();
  });

  it("the owner can access their own tournament + player", async () => {
    await expect(getTournament(alice, aliceTournamentId)).resolves.toMatchObject({ name: "Alice Open" });
    await expect(getPlayer(alice, alicePlayerId)).resolves.toMatchObject({ fullName: "Alice Player" });
  });

  it("another workspace CANNOT read the tournament by id (FORBIDDEN, not NOT_FOUND)", async () => {
    await expect(getTournament(bob, aliceTournamentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("player profiles ARE public (directory) — another workspace can view them", async () => {
    await expect(getPlayer(bob, alicePlayerId)).resolves.toMatchObject({ fullName: "Alice Player" });
  });

  it("tournament list is still workspace-scoped by default; directory shows all players", async () => {
    const bobTournaments = await listTournaments(bob, PAGE, {});
    expect(bobTournaments.items.find((t) => t.id === aliceTournamentId)).toBeUndefined();

    const bobMine = await listPlayers(bob, PAGE, { scope: "mine" });
    expect(bobMine.items.find((p) => p.id === alicePlayerId)).toBeUndefined();

    const bobAll = await listPlayers(bob, PAGE, { scope: "all" });
    expect(bobAll.items.find((p) => p.id === alicePlayerId)).toBeDefined();
  });
});

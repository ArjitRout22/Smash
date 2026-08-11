/**
 * Seed script — idempotent-ish demo data.
 *
 * Creates roles/permissions, demo users (admin/organizer/player), players, and
 * a fully-played singles tournament (group matches + a 4-player knockout) by
 * driving the REAL services (createMatch/submitScore/generateBracket), so the
 * resulting leaderboards, rankings and point ledger are genuine, not faked.
 *
 * Run: npm run db:seed   (after db:migrate)
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { ROLE_PERMISSIONS, permissionsForRole } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createStage } from "@/lib/services/stage.service";
import { generateBracket } from "@/lib/services/stage.service";
import { createMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

async function main() {
  console.log("🌱 Seeding…");

  const org = await prisma.organization.upsert({
    where: { slug: "smash-club" },
    update: {},
    create: { name: "Smash Badminton Club", slug: "smash-club" },
  });

  // Roles + permissions ------------------------------------------------------
  const roleByName: Record<string, string> = {};
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} role` },
    });
    roleByName[roleName] = role.id;
    for (const key of perms) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // Demo users (all share the demo password below) ----------------------------
  const DEMO_PASSWORD = "password123";
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const demoUsers = [
    { email: "admin@smash.test", name: "Admin User", role: "ADMIN" },
    { email: "organizer@smash.test", name: "Olivia Organizer", role: "ORGANIZER" },
    { email: "player@smash.test", name: "Pranav Player", role: "PLAYER" },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, roleId: roleByName[u.role], organizationId: org.id, passwordHash },
      create: { email: u.email, name: u.name, roleId: roleByName[u.role], organizationId: org.id, passwordHash },
    });
  }
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@smash.test" } });
  const actor: AuthUser = {
    id: adminUser.id,
    email: adminUser.email,
    phone: adminUser.phone,
    name: adminUser.name,
    role: "ADMIN",
    organizationId: org.id,
    playerId: null,
    permissions: permissionsForRole("ADMIN"),
  };

  // Players ------------------------------------------------------------------
  const names = [
    "Arjit Rout", "Saina N.", "Kidambi S.", "Lakshya Sen",
    "P.V. Sindhu", "H.S. Prannoy", "Chirag S.", "Satwik R.",
  ];
  const players = [];
  for (const fullName of names) {
    const displayName = fullName.split(" ")[0];
    let player = await prisma.player.findFirst({ where: { fullName, organizationId: org.id } });
    if (!player) {
      player = await prisma.player.create({
        data: { fullName, displayName, organizationId: org.id, city: "Bengaluru" },
      });
    }
    players.push(player);
  }

  // A fresh tournament each run (keeps seed re-runnable without duplicates).
  const existing = await prisma.tournament.findFirst({ where: { name: "Summer Slam (Seed)", deletedAt: null } });
  if (existing) {
    await prisma.tournament.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  const tournament = await createTournament(
    {
      name: "Summer Slam (Seed)",
      description: "Auto-generated demo tournament with a group stage and a 4-player knockout.",
      location: "Center Court",
      format: "singles",
    },
    actor
  );
  await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "ongoing" } });

  await addTournamentPlayers(tournament.id, players.map((p) => p.id), actor);

  // Group stage with a few matches -------------------------------------------
  const group = await createStage(tournament.id, { name: "Group Stage", type: "group", order: 0 }, actor);
  const groupPairs: [number, number, number[][]][] = [
    [0, 1, [[21, 15], [21, 18]]],
    [2, 3, [[19, 21], [21, 17], [21, 16]]],
    [4, 5, [[21, 12], [21, 9]]],
    [6, 7, [[15, 21], [21, 19], [18, 21]]],
    [0, 2, [[21, 18], [21, 19]]],
    [4, 6, [[21, 14], [23, 21]]],
  ];
  for (const [a, b, games] of groupPairs) {
    const match = await createMatch(
      {
        tournamentId: tournament.id,
        stageId: group.id,
        matchType: "singles",
        bestOf: (games.length > 2 ? 3 : 3) as 3,
        sideA: { playerId: players[a].id },
        sideB: { playerId: players[b].id },
      },
      actor
    );
    await submitScore(
      match.id,
      { games: games.map(([scoreA, scoreB]) => ({ scoreA, scoreB })) },
      actor
    );
  }

  // 4-player knockout (Semifinal → Final) generated + scored ------------------
  const top4 = [players[0], players[2], players[4], players[6]];
  await generateBracket(tournament.id, { name: "Knockout", participantIds: top4.map((p) => p.id) }, actor);

  // Score the semifinals, then the final (winners auto-advance).
  const semis = await prisma.match.findMany({
    where: { tournamentId: tournament.id, round: 1, stage: { type: "semifinal" } },
    orderBy: { slot: "asc" },
  });
  for (const sf of semis) {
    await submitScore(sf.id, { games: [{ scoreA: 21, scoreB: 14 }, { scoreA: 21, scoreB: 17 }] }, actor);
  }
  const final = await prisma.match.findFirst({
    where: { tournamentId: tournament.id, stage: { type: "final" } },
  });
  if (final) {
    // Ensure both finalists are seated (they are, via propagation), then score.
    await submitScore(final.id, { games: [{ scoreA: 21, scoreB: 19 }, { scoreA: 19, scoreB: 21 }, { scoreA: 21, scoreB: 18 }] }, actor);
  }

  console.log("✅ Seed complete.\n");
  console.log(`Demo logins (password for all: "${DEMO_PASSWORD}"):`);
  demoUsers.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email.padEnd(22)} (${u.name})`));
  console.log(`\nTournament: ${tournament.name} — ${tournament.id}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

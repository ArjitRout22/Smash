import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam, updateTeam } from "@/lib/services/team.service";
import { generateFixtures, getMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

/**
 * Renaming a team relabels it on EVERY match it appears in — scheduled and
 * completed alike — because a rename keeps the team's identity and its per-match
 * player snapshots; only the label changes. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("team rename affects all matches (integration)", () => {
  let actor: AuthUser;
  const tournamentIds: string[] = [];
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `tr-${Date.now()}@smash.test`, name: "TR Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
  });
  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it("rename shows on both completed and scheduled matches", async () => {
    const t = await createTournament({ name: `TR ${Date.now()}`, format: "doubles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    const teamIds: string[] = [];
    for (let ti = 0; ti < 3; ti++) {
      const p1 = await prisma.player.create({ data: { fullName: `TR T${ti} P1`, displayName: `T${ti}P1` } });
      const p2 = await prisma.player.create({ data: { fullName: `TR T${ti} P2`, displayName: `T${ti}P2` } });
      playerIds.push(p1.id, p2.id);
      await addTournamentPlayers(t.id, [p1.id, p2.id], actor);
      const team = await createTeam({ name: `Original ${ti}`, teamType: "doubles", tournamentId: t.id, playerIds: [p1.id, p2.id] }, actor);
      teamIds.push(team.id);
    }
    const target = teamIds[0]; // "Original 0" — the team we'll rename

    // Round-robin → 3 matches; every match involving `target` starts labelled "Original 0".
    await generateFixtures(t.id, { stageName: "RR", matchType: "doubles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: teamIds }, actor);

    const involving = await prisma.match.findMany({
      where: { tournamentId: t.id, participants: { some: { teamId: target } } },
      include: { participants: true },
      orderBy: { createdAt: "asc" },
    });
    expect(involving.length).toBe(2); // target plays the other 2 teams

    // Complete ONE of them, leave the other scheduled.
    const completed = involving[0];
    const stillScheduled = involving[1];
    await submitScore(completed.id, { games: [{ scoreA: 21, scoreB: 10 }] }, actor);

    // Rename the team.
    await updateTeam(target, { name: "Renamed FC" }, actor);

    const labelFor = (m: Awaited<ReturnType<typeof getMatch>>, teamId: string) =>
      m.sides.find((s) => s.teamId === teamId)!.label;

    const completedAfter = await getMatch(actor, completed.id);
    const scheduledAfter = await getMatch(actor, stillScheduled.id);

    // Both the completed and the scheduled match now show the NEW name.
    expect(labelFor(completedAfter, target)).toBe("Renamed FC");
    expect(labelFor(scheduledAfter, target)).toBe("Renamed FC");

    // The Team record itself is renamed.
    const teamRow = await prisma.team.findUniqueOrThrow({ where: { id: target } });
    expect(teamRow.name).toBe("Renamed FC");
  });
});

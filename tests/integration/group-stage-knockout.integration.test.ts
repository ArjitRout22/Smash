import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { generateFixtures } from "@/lib/services/match.service";
import { advanceGroupsToKnockout } from "@/lib/services/stage.service";
import { submitScore } from "@/lib/services/score.service";

// group_stage → auto-advancing knockout. RUN_DB_TESTS=1 against a TEST db.
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("group stage → auto knockout (integration)", () => {
  let actor: AuthUser;
  const pool: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `gk-${Date.now()}@smash.test`, name: "GK Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
    for (let i = 0; i < 30; i++) {
      const p = await prisma.player.create({ data: { fullName: `GK Player ${i}`, displayName: `K${i}` } });
      pool.push(p.id);
    }
  });

  async function freshTournament(playerIds: string[]) {
    const t = await createTournament({ name: `GK ${Date.now()}-${Math.round(performance.now())}`, format: "singles", visibility: "private" }, actor);
    await addTournamentPlayers(t.id, playerIds, actor);
    return t.id;
  }

  async function scoreAllGroupMatches(tId: string) {
    const stage = await prisma.stage.findFirst({ where: { tournamentId: tId, type: "group" }, orderBy: { order: "asc" } });
    const matches = await prisma.match.findMany({ where: { stageId: stage!.id, deletedAt: null } });
    for (const m of matches) {
      // Side A always wins → deterministic standings (first-listed of each group tops it).
      await submitScore(m.id, { games: [{ scoreA: 21, scoreB: 10 }, { scoreA: 21, scoreB: 12 }] }, actor);
    }
    return matches.length;
  }

  it("10 groups of 3, top 2 → 20 qualifiers → R32→…→Final, played to a champion", async () => {
    const players = pool.slice(0, 30);
    const tId = await freshTournament(players);
    const groups = Array.from({ length: 10 }, (_, g) => players.slice(g * 3, g * 3 + 3));

    const gen = await generateFixtures(tId, { mode: "group_stage", groups, qualifiersPerGroup: 2, matchType: "singles", bestOf: 3, rounds: 1, stageName: "Group Stage" }, actor);
    expect(gen.created).toBe(30); // 3 per group × 10

    const groupStage = await prisma.stage.findFirst({ where: { tournamentId: tId, type: "group" } });
    expect((groupStage!.config as { qualifiersPerGroup: number }).qualifiersPerGroup).toBe(2);
    // Labels A–J for 10 groups.
    const labels = await prisma.tournamentPlayer.findMany({ where: { tournamentId: tId }, select: { group: true }, distinct: ["group"] });
    expect(new Set(labels.map((l) => l.group)).size).toBe(10);

    await scoreAllGroupMatches(tId);
    const res = await advanceGroupsToKnockout(tId, actor);
    expect(res.qualifiers).toBe(20);

    const stages = await prisma.stage.findMany({ where: { tournamentId: tId }, orderBy: { order: "asc" } });
    expect(stages.map((s) => s.type)).toEqual(["group", "round_of_32", "round_of_16", "quarterfinal", "semifinal", "final"]);

    // Play the knockout to completion.
    for (let guard = 0; guard < 60; guard++) {
      const ready = await prisma.match.findFirst({
        where: { tournamentId: tId, stage: { type: { not: "group" } }, status: { in: ["scheduled", "in_progress"] }, closedAt: null },
        include: { participants: true },
        orderBy: [{ round: "asc" }, { slot: "asc" }],
      });
      if (!ready || ready.participants.length < 2) break;
      await submitScore(ready.id, { games: [{ scoreA: 21, scoreB: 15 }, { scoreA: 21, scoreB: 17 }] }, actor);
    }
    const final = await prisma.match.findFirst({ where: { tournamentId: tId, stage: { type: "final" } } });
    expect(final?.status).toBe("completed");
    expect(final?.winnerSide).toBeTruthy();
  });

  it("8 groups of 3, top 1 → 8 qualifiers → straight to quarterfinal (no byes)", async () => {
    const players = pool.slice(0, 24);
    const tId = await freshTournament(players);
    const groups = Array.from({ length: 8 }, (_, g) => players.slice(g * 3, g * 3 + 3));
    await generateFixtures(tId, { mode: "group_stage", groups, qualifiersPerGroup: 1, matchType: "singles", bestOf: 3, rounds: 1, stageName: "Groups" }, actor);
    await scoreAllGroupMatches(tId);
    const res = await advanceGroupsToKnockout(tId, actor);
    expect(res.qualifiers).toBe(8);
    const stages = await prisma.stage.findMany({ where: { tournamentId: tId }, orderBy: { order: "asc" } });
    expect(stages.map((s) => s.type)).toEqual(["group", "quarterfinal", "semifinal", "final"]);
  });

  it("refuses to advance before the group matches are finished, and refuses a double-advance", async () => {
    const players = pool.slice(0, 6);
    const tId = await freshTournament(players);
    const groups = [players.slice(0, 3), players.slice(3, 6)];
    await generateFixtures(tId, { mode: "group_stage", groups, qualifiersPerGroup: 2, matchType: "singles", bestOf: 3, rounds: 1, stageName: "Groups" }, actor);

    await expect(advanceGroupsToKnockout(tId, actor)).rejects.toThrow(/finish all group matches/i);
    await scoreAllGroupMatches(tId);
    await advanceGroupsToKnockout(tId, actor); // ok
    await expect(advanceGroupsToKnockout(tId, actor)).rejects.toThrow(/already been generated/i);
  });
});

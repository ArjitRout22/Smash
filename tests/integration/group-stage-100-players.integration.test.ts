import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { generateFixtures } from "@/lib/services/match.service";
import { advanceGroupsToKnockout } from "@/lib/services/stage.service";
import { submitScore } from "@/lib/services/score.service";

// Scale test: 100 players across many groups → auto knockout. RUN_DB_TESTS=1.
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("100-player group stage → knockout (integration)", () => {
  let actor: AuthUser;
  const pool: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `h-${Date.now()}@smash.test`, name: "H Admin", roleId: role.id } });
    actor = { id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name, role: "ADMIN", organizationId: null, playerId: null, permissions: permissionsForRole("ADMIN") };
    for (let i = 0; i < 100; i++) {
      const p = await prisma.player.create({ data: { fullName: `H Player ${i}`, displayName: `H${i}` } });
      pool.push(p.id);
    }
  }, 60000);

  async function freshTournament() {
    const t = await createTournament({ name: `H ${Date.now()}-${Math.round(performance.now())}`, format: "singles", visibility: "private" }, actor);
    await addTournamentPlayers(t.id, pool, actor);
    return t.id;
  }
  /** Distribute 100 players round-robin into `n` groups (uneven when not divisible). */
  function intoGroups(n: number): string[][] {
    const groups: string[][] = Array.from({ length: n }, () => []);
    pool.forEach((id, i) => groups[i % n].push(id));
    return groups;
  }
  async function scoreAllGroupMatches(tId: string) {
    const stage = await prisma.stage.findFirst({ where: { tournamentId: tId, type: "group" } });
    const matches = await prisma.match.findMany({ where: { stageId: stage!.id, deletedAt: null }, select: { id: true } });
    for (const m of matches) await submitScore(m.id, { games: [{ scoreA: 21, scoreB: 10 }, { scoreA: 21, scoreB: 12 }] }, actor);
    return matches.length;
  }

  it("34 groups, top 2 → 68 qualifiers → a 128-slot knockout generates and its first round is playable", async () => {
    const tId = await freshTournament();
    const groups = intoGroups(34); // 32 groups of 3 + 2 of 2 = 100
    const gen = await generateFixtures(tId, { mode: "group_stage", groups, qualifiersPerGroup: 2, matchType: "singles", bestOf: 3, rounds: 1, stageName: "Group Stage" }, actor);
    expect(gen.created).toBe(98); // 32*3 + 2*1

    const distinctGroups = await prisma.tournamentPlayer.findMany({ where: { tournamentId: tId }, select: { group: true }, distinct: ["group"] });
    expect(distinctGroups.length).toBe(34); // labels A–Z then 27..34

    await scoreAllGroupMatches(tId);
    const res = await advanceGroupsToKnockout(tId, actor);
    expect(res.qualifiers).toBe(68); // 34 groups × top 2

    // 68 → nextPow2 128; first knockout round has 64 matches (60 byes auto-completed).
    const knockoutStages = await prisma.stage.findMany({ where: { tournamentId: tId, type: { not: "group" } }, orderBy: { order: "asc" }, include: { _count: { select: { matches: true } } } });
    const firstRound = knockoutStages[0];
    expect(firstRound._count.matches).toBe(64);
    const byes = await prisma.match.count({ where: { stageId: firstRound.id, status: "completed" } });
    expect(byes).toBe(128 - 68); // 60 byes
    // Stage chain ends at a single final.
    expect(knockoutStages[knockoutStages.length - 1].type).toBe("final");
  }, 90000);

  it("40 groups, top 1 → 40 qualifiers into a 64-slot knockout", async () => {
    const tId = await freshTournament();
    const groups = intoGroups(40); // 20 groups of 3 + 20 of 2
    const gen = await generateFixtures(tId, { mode: "group_stage", groups, qualifiersPerGroup: 1, matchType: "singles", bestOf: 3, rounds: 1, stageName: "Groups" }, actor);
    expect(gen.created).toBe(80); // 20*3 + 20*1

    const distinctGroups = await prisma.tournamentPlayer.findMany({ where: { tournamentId: tId }, select: { group: true }, distinct: ["group"] });
    expect(distinctGroups.length).toBe(40);

    await scoreAllGroupMatches(tId);
    const res = await advanceGroupsToKnockout(tId, actor);
    expect(res.qualifiers).toBe(40);
    const first = await prisma.stage.findFirst({ where: { tournamentId: tId, type: { not: "group" } }, orderBy: { order: "asc" }, include: { _count: { select: { matches: true } } } });
    expect(first!._count.matches).toBe(32); // 64-slot bracket → 32 first-round matches
  }, 90000);
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { createTournament, addTournamentPlayers } from "@/lib/services/tournament.service";
import { createTeam } from "@/lib/services/team.service";
import { generateFixtures, setLiveScore, listMatches, getMatch } from "@/lib/services/match.service";
import { submitScore } from "@/lib/services/score.service";

/**
 * Group-stage fixture generation + scoring + live scoring (the "Sunday" flows).
 *
 * Central case: 2 groups × 3 doubles teams, rounds:2 (double round-robin,
 * cross-group only) → exactly 18 matches, none rejected as a duplicate.
 * Also exercises the new "each doubles team needs exactly 2 active players"
 * guard, scoring/live-scoring on generated fixtures, match-status transitions,
 * and generation across every tournament status.
 *
 * DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("group-stage fixtures + scoring (integration)", () => {
  let actor: AuthUser;
  const tournamentIds: string[] = [];
  const playerIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const user = await prisma.user.create({ data: { email: `gf-${Date.now()}@smash.test`, name: "GF Admin", roleId: role.id } });
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

  /** Doubles tournament with `teamCount` complete (2-active-player) teams. */
  async function doublesTournamentWithTeams(teamCount: number, status?: string): Promise<{ id: string; teamIds: string[] }> {
    const t = await createTournament({ name: `GF ${Date.now()}-${Math.round(performance.now())}`, format: "doubles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    if (status) await prisma.tournament.update({ where: { id: t.id }, data: { status } });
    const teamIds: string[] = [];
    for (let ti = 0; ti < teamCount; ti++) {
      const p1 = await prisma.player.create({ data: { fullName: `GF T${ti} P1`, displayName: `T${ti}P1` } });
      const p2 = await prisma.player.create({ data: { fullName: `GF T${ti} P2`, displayName: `T${ti}P2` } });
      playerIds.push(p1.id, p2.id);
      await addTournamentPlayers(t.id, [p1.id, p2.id], actor);
      const team = await createTeam({ name: `Team ${ti}`, teamType: "doubles", tournamentId: t.id, playerIds: [p1.id, p2.id] }, actor);
      teamIds.push(team.id);
    }
    return { id: t.id, teamIds };
  }

  // -------------------------------------------------------------------------
  // A. Match generation
  // -------------------------------------------------------------------------

  it("2 groups × 3 doubles teams, rounds:2 → 18 cross-group matches (each pairing twice)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    const groups = [teamIds.slice(0, 3), teamIds.slice(3, 6)];

    const res = await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 2, mode: "groups", groups }, actor);
    expect(res.created).toBe(18);

    const matches = await prisma.match.findMany({ where: { tournamentId: id, deletedAt: null }, include: { participants: true } });
    expect(matches).toHaveLength(18);
    expect(matches.every((m) => m.bestOf === 1 && m.matchType === "doubles")).toBe(true);
    expect(matches.every((m) => m.participants.length === 2)).toBe(true);

    // Every match is strictly cross-group (1 A-team vs 1 B-team).
    const groupA = new Set(groups[0]);
    const groupB = new Set(groups[1]);
    for (const m of matches) {
      const teams = m.participants.map((p) => p.teamId!);
      expect(teams.filter((t) => groupA.has(t)).length).toBe(1);
      expect(teams.filter((t) => groupB.has(t)).length).toBe(1);
    }

    // 9 unique pairings, each appearing exactly twice (the 2nd is NOT rejected).
    const pairKey = (m: (typeof matches)[number]) => m.participants.map((p) => p.teamId!).sort().join("|");
    const counts = new Map<string, number>();
    for (const m of matches) counts.set(pairKey(m), (counts.get(pairKey(m)) ?? 0) + 1);
    expect(counts.size).toBe(9);
    expect([...counts.values()].every((c) => c === 2)).toBe(true);

    // Teams got their group label recorded for standings.
    const teamsWithGroup = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, group: true } });
    expect(teamsWithGroup.filter((t) => t.group === "A")).toHaveLength(3);
    expect(teamsWithGroup.filter((t) => t.group === "B")).toHaveLength(3);
  });

  it("rounds:1 → 9 cross-group matches (single round-robin)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    const res = await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 3, rounds: 1, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    expect(res.created).toBe(9);
  });

  it("singles round_robin: player participants, no doubles snapshot rows", async () => {
    const t = await createTournament({ name: `GF-singles ${Date.now()}`, format: "singles", visibility: "private" }, actor);
    tournamentIds.push(t.id);
    const pIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = await prisma.player.create({ data: { fullName: `S P${i}`, displayName: `SP${i}` } });
      pIds.push(p.id);
      playerIds.push(p.id);
    }
    await addTournamentPlayers(t.id, pIds, actor);
    const res = await generateFixtures(t.id, { stageName: "Round Robin", matchType: "singles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: pIds }, actor);
    expect(res.created).toBe(6); // C(4,2)
    const parts = await prisma.matchParticipant.findMany({ where: { match: { tournamentId: t.id } } });
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.playerId && !p.teamId)).toBe(true);
    const snaps = await prisma.matchParticipantPlayer.count({ where: { participant: { match: { tournamentId: t.id } } } });
    expect(snaps).toBe(0); // singles use participant.playerId directly
  });

  it("3 groups × 2 teams, rounds:1 → 12 cross-group matches", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    const groups = [teamIds.slice(0, 2), teamIds.slice(2, 4), teamIds.slice(4, 6)];
    // cross pairs = (2×2)+(2×2)+(2×2) = 12
    const res = await generateFixtures(id, { stageName: "Groups", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups }, actor);
    expect(res.created).toBe(12);
    const labels = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { group: true } });
    expect(new Set(labels.map((l) => l.group))).toEqual(new Set(["A", "B", "C"]));
  });

  it("round_robin mode: everyone plays everyone → C(4,2)=6", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(4);
    const res = await generateFixtures(id, { stageName: "RR", matchType: "doubles", bestOf: 1, rounds: 1, mode: "round_robin", participantIds: teamIds }, actor);
    expect(res.created).toBe(6);
  });

  it("regenerating the same config again does NOT reject the pairings as duplicates", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    const cfg = { stageName: "Group Stage", matchType: "doubles" as const, bestOf: 1 as const, rounds: 2 as const, mode: "groups" as const, groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] };
    await generateFixtures(id, cfg, actor);
    const res2 = await generateFixtures(id, cfg, actor);
    expect(res2.created).toBe(18);
    expect(await prisma.match.count({ where: { tournamentId: id, deletedAt: null } })).toBe(36);
  });

  // -------------------------------------------------------------------------
  // B. Validation → clean 4xx (never a generic 500)
  // -------------------------------------------------------------------------

  it("rejects a doubles team with only 1 active player (clean 4xx, not 500)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(2);
    // Strip one member so team[0] has a single active player.
    const victim = await prisma.teamPlayer.findFirst({ where: { teamId: teamIds[0] } });
    await prisma.teamPlayer.delete({ where: { id: victim!.id } });
    await expect(
      generateFixtures(id, { stageName: "GS", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [[teamIds[0]], [teamIds[1]]] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG", status: 422 });
    expect(await prisma.match.count({ where: { tournamentId: id, deletedAt: null } })).toBe(0);
  });

  it("rejects a doubles team with zero active players (clean 4xx, not 500)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(2);
    await prisma.teamPlayer.deleteMany({ where: { teamId: teamIds[0] } });
    await expect(
      generateFixtures(id, { stageName: "GS", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [[teamIds[0]], [teamIds[1]]] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG", status: 422 });
  });

  it("rejects a team appearing in two groups (duplicate participant)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(3);
    await expect(
      generateFixtures(id, { stageName: "GS", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [[teamIds[0]], [teamIds[0], teamIds[1]]] }, actor)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a nonexistent team id", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(2);
    await expect(
      generateFixtures(id, { stageName: "GS", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [["11111111-1111-1111-1111-111111111111"], [teamIds[0]]] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG" });
  });

  it("rejects a team from a different tournament", async () => {
    const a = await doublesTournamentWithTeams(2);
    const b = await doublesTournamentWithTeams(1);
    await expect(
      generateFixtures(a.id, { stageName: "GS", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [[b.teamIds[0]], [a.teamIds[0]]] }, actor)
    ).rejects.toMatchObject({ code: "INVALID_MATCH_CONFIG" });
  });

  // -------------------------------------------------------------------------
  // C. Display: generated fixtures serialize with correct labels + snapshots
  // -------------------------------------------------------------------------

  it("generated doubles fixtures serialize with team labels and 2-player snapshots", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 2, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    const { items, total } = await listMatches(actor, { page: 1, pageSize: 50, sortDir: "asc" }, { tournamentId: id });
    expect(total).toBe(18);
    for (const m of items) {
      expect(m.sides).toHaveLength(2);
      for (const s of m.sides) {
        expect(s.teamId).toBeTruthy();
        expect(s.label).not.toBe("TBD");
        expect(s.players).toHaveLength(2); // immutable per-match snapshot
      }
    }
  });

  // -------------------------------------------------------------------------
  // D. Scoring + live scoring on generated fixtures
  // -------------------------------------------------------------------------

  it("live scoring: sets running score and flips a scheduled match to in_progress", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    const first = await prisma.match.findFirstOrThrow({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } });
    expect(first.status).toBe("scheduled");

    const live = await setLiveScore(actor, first.id, 11, 7);
    expect(live.status).toBe("in_progress");
    expect(live.liveA).toBe(11);
    expect(live.liveB).toBe(7);
  });

  it("scoring a best-of-1 fixture completes it, sets the winner, closes it, and awards points", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    const match = await prisma.match.findFirstOrThrow({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } });

    await submitScore(match.id, { games: [{ scoreA: 21, scoreB: 15 }] }, actor);
    const scored = await getMatch(actor, match.id);
    expect(scored.status).toBe("completed");
    expect(scored.winnerSide).toBe("A");
    expect(scored.isClosed).toBe(true);
    const winner = scored.sides.find((s) => s.side === "A")!;
    expect(winner.isWinner).toBe(true);

    // Live running score is cleared once the real result is saved.
    expect(scored.liveA).toBeNull();
    expect(scored.liveB).toBeNull();

    // Points ledger written for the winning side's 2 players.
    const ledger = await prisma.pointTransaction.findMany({ where: { matchId: match.id } });
    expect(ledger.length).toBeGreaterThan(0);
  });

  it("cannot score a cancelled match (clean 4xx)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    const match = await prisma.match.findFirstOrThrow({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } });
    await prisma.match.update({ where: { id: match.id }, data: { status: "cancelled" } });
    await expect(submitScore(match.id, { games: [{ scoreA: 21, scoreB: 15 }] }, actor)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects an invalid badminton score (clean 4xx)", async () => {
    const { id, teamIds } = await doublesTournamentWithTeams(6);
    await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 1, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
    const match = await prisma.match.findFirstOrThrow({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } });
    await expect(submitScore(match.id, { games: [{ scoreA: 10, scoreB: 5 }] }, actor)).rejects.toMatchObject({ code: "INVALID_SCORE" });
  });

  // -------------------------------------------------------------------------
  // E. Tournament statuses — generation works regardless of status
  // -------------------------------------------------------------------------

  it.each(["upcoming", "ongoing", "completed", "cancelled"])(
    "generates 18 fixtures for a '%s' tournament",
    async (status) => {
      const { id, teamIds } = await doublesTournamentWithTeams(6, status);
      const res = await generateFixtures(id, { stageName: "Group Stage", matchType: "doubles", bestOf: 1, rounds: 2, mode: "groups", groups: [teamIds.slice(0, 3), teamIds.slice(3, 6)] }, actor);
      expect(res.created).toBe(18);
    }
  );
});

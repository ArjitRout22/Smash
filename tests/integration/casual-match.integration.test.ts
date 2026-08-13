import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import {
  createCasualMatch,
  actOnCasualMatch,
  reportCasualScore,
  getCasualMatch,
} from "@/lib/services/casual-match.service";

/**
 * Casual-match state machine after dropping the accept step: a challenge is
 * playable the moment it's created, the challenged side can REJECT (→ cancelled),
 * and the score still needs report → confirm. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("casual match — no-accept flow (integration)", () => {
  let challenger: AuthUser;
  let opponent: AuthUser;
  let challengerPlayerId: string;
  let opponentPlayerId: string;
  const created: string[] = [];

  async function makeUserPlayer(tag: string): Promise<{ actor: AuthUser; playerId: string }> {
    const role = await prisma.role.upsert({ where: { name: "PLAYER" }, update: {}, create: { name: "PLAYER", description: "player" } });
    const player = await prisma.player.create({ data: { fullName: `CM ${tag}`, displayName: tag } });
    const user = await prisma.user.create({
      data: { email: `cm-${tag}-${Date.now()}@smash.test`, name: `CM ${tag}`, roleId: role.id, playerId: player.id, isActive: true },
    });
    return {
      playerId: player.id,
      actor: {
        id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name,
        role: "PLAYER", organizationId: null, playerId: player.id, permissions: permissionsForRole("PLAYER"),
      },
    };
  }

  beforeAll(async () => {
    const a = await makeUserPlayer("Alice");
    const b = await makeUserPlayer("Bob");
    challenger = a.actor;
    challengerPlayerId = a.playerId;
    opponent = b.actor;
    opponentPlayerId = b.playerId;
  });

  afterAll(async () => {
    await prisma.casualMatch.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: [challenger.id, opponent.id] } } });
    await prisma.player.deleteMany({ where: { id: { in: [challengerPlayerId, opponentPlayerId] } } });
    await prisma.$disconnect();
  });

  async function newMatch() {
    const m = await createCasualMatch(challenger, { matchType: "singles", opponentPlayerId, bestOf: 1 });
    created.push(m.id);
    return m;
  }

  it("a new challenge is immediately playable — no accept step", async () => {
    const m = await newMatch();
    expect(m.status).toBe("accepted");
    // The challenger can enter a result right away.
    expect(m.canReport).toBe(true);
  });

  it("the challenged side sees a reject option, the challenger does not", async () => {
    const m = await newMatch();
    expect((await getCasualMatch(opponent, m.id)).canReject).toBe(true);
    expect((await getCasualMatch(challenger, m.id)).canReject).toBe(false);
  });

  it("the challenged side rejecting cancels the match", async () => {
    const m = await newMatch();
    const after = await actOnCasualMatch(opponent, m.id, { action: "decline" });
    expect(after.status).toBe("cancelled");
  });

  it("the challenger cannot reject their own challenge", async () => {
    const m = await newMatch();
    await expect(actOnCasualMatch(challenger, m.id, { action: "decline" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("report → confirm completes the match with no accept in between", async () => {
    const m = await newMatch();
    const reported = await reportCasualScore(challenger, m.id, { games: [{ scoreA: 21, scoreB: 15 }] });
    expect(reported.status).toBe("awaiting_confirmation");
    const confirmed = await actOnCasualMatch(opponent, m.id, { action: "confirm" });
    expect(confirmed.status).toBe("completed");
    expect(confirmed.winnerSide).toBe("A");
  });

  it("rejecting a reported score returns it to playable", async () => {
    const m = await newMatch();
    await reportCasualScore(challenger, m.id, { games: [{ scoreA: 21, scoreB: 10 }] });
    const rejected = await actOnCasualMatch(opponent, m.id, { action: "reject" });
    expect(rejected.status).toBe("accepted");
    expect(rejected.games).toHaveLength(0);
  });
});

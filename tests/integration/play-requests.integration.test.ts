import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { listNearbyPlayers, sendPlayRequest, actOnPlayRequest, listMyPlayRequests } from "@/lib/services/play.service";
import { addComment } from "@/lib/services/comment.service";

/**
 * Nearby discovery + request-to-play + connected chat. DB-gated (RUN_DB_TESTS=1).
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("nearby players + play requests (integration)", () => {
  const users: string[] = [];
  const players: string[] = [];
  const actor: Record<string, AuthUser> = {};
  const pid: Record<string, string> = {};

  async function make(tag: string, lat: number, lng: number, discoverable: boolean) {
    const role = await prisma.role.upsert({ where: { name: "PLAYER" }, update: {}, create: { name: "PLAYER", description: "player" } });
    const player = await prisma.player.create({ data: { fullName: `NB ${tag}`, displayName: tag, locationLat: lat, locationLng: lng, discoverable } });
    const user = await prisma.user.create({ data: { email: `nb-${tag}-${Date.now()}@smash.test`, name: `NB ${tag}`, roleId: role.id, playerId: player.id, isActive: true } });
    users.push(user.id);
    players.push(player.id);
    pid[tag] = player.id;
    actor[tag] = { id: user.id, email: user.email, emailVerified: true, phone: null, name: user.name, role: "PLAYER", organizationId: null, playerId: player.id, permissions: permissionsForRole("PLAYER") };
  }

  beforeAll(async () => {
    await make("A", 12.97, 77.59, true); // Bengaluru
    await make("B", 12.98, 77.60, true); // ~1.5 km from A
    await make("C", 12.97, 77.59, false); // nearby but NOT discoverable
  });

  afterAll(async () => {
    await prisma.playRequest.deleteMany({ where: { fromPlayerId: { in: players } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.player.deleteMany({ where: { id: { in: players } } });
    await prisma.$disconnect();
  });

  it("lists discoverable players nearby, excluding self and non-discoverable", async () => {
    const res = await listNearbyPlayers(actor.A);
    expect(res.hasLocation).toBe(true);
    const ids = res.players.map((p) => p.id);
    expect(ids).toContain(pid.B);
    expect(ids).not.toContain(pid.A); // self
    expect(ids).not.toContain(pid.C); // not discoverable
  });

  it("sends a request, blocks self + duplicates + non-discoverable targets", async () => {
    const sent = await sendPlayRequest(actor.A, pid.B, "fancy a game?");
    expect(sent.status).toBe("pending");
    await expect(sendPlayRequest(actor.A, pid.A)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(sendPlayRequest(actor.A, pid.B)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(sendPlayRequest(actor.A, pid.C)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("only the recipient can accept; then both are connected", async () => {
    const inboxB = await listMyPlayRequests(actor.B);
    const req = inboxB.incoming.find((r) => r.other.id === pid.A)!;
    expect(req).toBeTruthy();
    // Sender can't accept their own request.
    await expect(actOnPlayRequest(actor.A, req.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const after = await actOnPlayRequest(actor.B, req.id, "accept");
    expect(after.status).toBe("accepted");
    const connA = await listMyPlayRequests(actor.A);
    expect(connA.connected.some((r) => r.other.id === pid.B)).toBe(true);
  });

  it("chat is gated to connected players", async () => {
    const inboxA = await listMyPlayRequests(actor.A);
    const conn = inboxA.connected.find((r) => r.other.id === pid.B)!;
    const c = await addComment(actor.A, "play_request", conn.id, { body: "See you at 6?" });
    expect(c.body).toBe("See you at 6?");
    // A stranger can't read/post.
    await make("Z", 0, 0, false);
    await expect(addComment(actor.Z, "play_request", conn.id, { body: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

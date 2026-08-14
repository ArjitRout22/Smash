import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * "Play near me" — discover opted-in players around your saved home location and
 * send a request to play (accept / decline). Distance is Haversine over the
 * players' own coordinates; only APPROXIMATE distance is ever returned, and only
 * players who opted in (`discoverable`) with a login account appear.
 */

const RADIUS_KM = 25;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type NearbyStatus = "none" | "requested" | "incoming" | "connected";

export async function listNearbyPlayers(actor: AuthUser) {
  if (!actor.playerId) return { hasLocation: false, discoverable: false, players: [] as NearbyPlayer[] };
  const me = await prisma.player.findUnique({
    where: { id: actor.playerId },
    select: { locationLat: true, locationLng: true, discoverable: true },
  });
  const discoverable = me?.discoverable ?? false;
  if (me?.locationLat == null || me.locationLng == null) return { hasLocation: false, discoverable, players: [] as NearbyPlayer[] };

  // Bounding-box prefilter (~0.3° ≈ 33km), then exact Haversine + radius.
  const dLat = 0.3;
  const dLng = 0.3 / Math.max(0.1, Math.cos((me.locationLat * Math.PI) / 180));
  const candidates = await prisma.player.findMany({
    where: {
      discoverable: true,
      deletedAt: null,
      id: { not: actor.playerId },
      user: { is: { isActive: true, deletedAt: null } }, // must have an account to receive requests
      locationLat: { gte: me.locationLat - dLat, lte: me.locationLat + dLat },
      locationLng: { gte: me.locationLng - dLng, lte: me.locationLng + dLng },
    },
    select: { id: true, displayName: true, city: true, skillLevel: true, locationLat: true, locationLng: true },
    take: 100,
  });

  // Existing requests between me and anyone (to annotate each card's state).
  const reqs = await prisma.playRequest.findMany({
    where: { status: { in: ["pending", "accepted"] }, OR: [{ fromUserId: actor.id }, { toUserId: actor.id }] },
    select: { fromPlayerId: true, toPlayerId: true, fromUserId: true, status: true },
  });
  const statusFor = (playerId: string): NearbyStatus => {
    const r = reqs.find((x) => x.fromPlayerId === playerId || x.toPlayerId === playerId);
    if (!r) return "none";
    if (r.status === "accepted") return "connected";
    return r.fromUserId === actor.id ? "requested" : "incoming";
  };

  const players: NearbyPlayer[] = candidates
    .map((c) => ({ c, km: distanceKm(me.locationLat!, me.locationLng!, c.locationLat!, c.locationLng!) }))
    .filter((x) => x.km <= RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, 20)
    .map(({ c, km }) => ({
      id: c.id,
      displayName: c.displayName,
      city: c.city,
      skillLevel: c.skillLevel,
      distanceKm: Math.round(km * 10) / 10,
      requestStatus: statusFor(c.id),
    }));

  return { hasLocation: true, discoverable, players };
}

export type NearbyPlayer = {
  id: string;
  displayName: string;
  city: string | null;
  skillLevel: string | null;
  distanceKm: number;
  requestStatus: NearbyStatus;
};

export async function sendPlayRequest(actor: AuthUser, toPlayerId: string, note?: string) {
  if (!actor.playerId) throw Errors.validation("Your account isn't linked to a player profile.");
  if (toPlayerId === actor.playerId) throw Errors.validation("You can't request to play with yourself.");
  const to = await prisma.player.findFirst({
    where: { id: toPlayerId, deletedAt: null },
    include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
  });
  if (!to) throw Errors.notFound("Player");
  if (!to.discoverable) throw Errors.validation("This player isn't accepting play requests right now.");
  if (!to.user || !to.user.isActive || to.user.deletedAt) throw Errors.validation("This player doesn't have an account yet.");

  const existing = await prisma.playRequest.findFirst({
    where: {
      status: { in: ["pending", "accepted"] },
      OR: [
        { fromPlayerId: actor.playerId, toPlayerId },
        { fromPlayerId: toPlayerId, toPlayerId: actor.playerId },
      ],
    },
  });
  if (existing) throw Errors.conflict("There's already an open play request between you two.");

  const created = await prisma.playRequest.create({
    data: {
      fromPlayerId: actor.playerId,
      fromUserId: actor.id,
      toPlayerId,
      toUserId: to.user.id,
      note: note?.trim() || null,
      status: "pending",
    },
  });
  await audit({ actorUserId: actor.id, action: "play_request.sent", entityType: "PlayRequest", entityId: created.id, newValue: { toPlayerId } });
  return { id: created.id, status: created.status };
}

/** Recipient accepts/declines; sender cancels. */
export async function actOnPlayRequest(actor: AuthUser, id: string, action: "accept" | "decline" | "cancel") {
  const r = await prisma.playRequest.findUnique({ where: { id } });
  if (!r) throw Errors.notFound("Play request");
  if (r.status !== "pending") throw Errors.invalidState("This request has already been answered.");

  if (action === "cancel") {
    if (r.fromUserId !== actor.id) throw Errors.forbidden("Only the sender can cancel this request.");
  } else if (r.toUserId !== actor.id) {
    throw Errors.forbidden("Only the person invited can respond to this request.");
  }

  const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
  await prisma.playRequest.update({ where: { id }, data: { status, respondedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: `play_request.${action}`, entityType: "PlayRequest", entityId: id, newValue: { status } });
  return { id, status };
}

export async function listMyPlayRequests(actor: AuthUser) {
  if (!actor.playerId) return { incoming: [], connected: [], outgoing: [] };
  const rows = await prisma.playRequest.findMany({
    where: {
      OR: [{ fromUserId: actor.id }, { toUserId: actor.id }],
      status: { in: ["pending", "accepted"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      fromPlayer: { select: { id: true, displayName: true } },
      toPlayer: { select: { id: true, displayName: true } },
    },
  });

  const map = (r: (typeof rows)[number]) => {
    const iAmRecipient = r.toUserId === actor.id;
    const other = iAmRecipient ? r.fromPlayer : r.toPlayer;
    return { id: r.id, status: r.status, note: r.note, createdAt: r.createdAt, other };
  };

  return {
    incoming: rows.filter((r) => r.status === "pending" && r.toUserId === actor.id).map(map),
    outgoing: rows.filter((r) => r.status === "pending" && r.fromUserId === actor.id).map(map),
    connected: rows.filter((r) => r.status === "accepted").map(map),
  };
}

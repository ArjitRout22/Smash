import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import type { AuthUser } from "@/lib/auth/authorize";
import { sendTournamentReminderEmail, sendInviteReminderEmail } from "@/lib/email/notifications";

/**
 * Manual, admin-driven tournament reminders (no scheduled cron). An admin picks a
 * tournament and, optionally, a subset of its players. Recipients can be either:
 *  - `registered` players → a "tournament is coming up" reminder, or
 *  - `invited` players who haven't responded → a nudge to accept/decline.
 * Only players with a login account can receive email. Sends are best-effort.
 */

const REMINDABLE = ["registered", "invited"] as const;

function assertAdmin(actor: AuthUser) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden();
}

/** Upcoming tournaments an admin can remind, with their emailable players. */
export async function listReminderTargets(actor: AuthUser) {
  assertAdmin(actor);
  const tournaments = await prisma.tournament.findMany({
    where: { deletedAt: null, status: "upcoming" },
    select: {
      id: true,
      name: true,
      startDate: true,
      tournamentPlayers: {
        where: { status: { in: [...REMINDABLE] } },
        select: {
          status: true,
          player: { select: { id: true, displayName: true, user: { select: { email: true } } } },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  return tournaments
    .map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      players: t.tournamentPlayers
        .filter((tp) => tp.player.user?.email)
        .map((tp) => ({ playerId: tp.player.id, name: tp.player.displayName, status: tp.status })),
    }))
    .filter((t) => t.players.length > 0);
}

/** Send reminders to the chosen players (all emailable ones if none given). */
export async function sendTournamentReminders(
  actor: AuthUser,
  tournamentId: string,
  playerIds?: string[]
) {
  assertAdmin(actor);
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, name: true, startDate: true, location: true },
  });
  if (!t) throw Errors.notFound("Tournament");

  const rows = await prisma.tournamentPlayer.findMany({
    where: {
      tournamentId,
      status: { in: [...REMINDABLE] },
      ...(playerIds && playerIds.length ? { playerId: { in: playerIds } } : {}),
    },
    select: {
      status: true,
      player: { select: { displayName: true, user: { select: { email: true } } } },
    },
  });

  let remindersSent = 0;
  let nudgesSent = 0;
  for (const tp of rows) {
    const email = tp.player.user?.email;
    if (!email) continue;
    if (tp.status === "invited") {
      const ok = await sendInviteReminderEmail({
        to: email,
        playerName: tp.player.displayName,
        tournamentName: t.name,
        startDate: t.startDate,
        location: t.location,
      });
      if (ok) nudgesSent++;
    } else {
      const ok = await sendTournamentReminderEmail({
        to: email,
        playerName: tp.player.displayName,
        tournamentName: t.name,
        tournamentId: t.id,
        startDate: t.startDate,
        location: t.location,
      });
      if (ok) remindersSent++;
    }
  }

  const emailsSent = remindersSent + nudgesSent;
  await audit({
    actorUserId: actor.id,
    action: "reminders.sent",
    entityType: "Tournament",
    entityId: tournamentId,
    newValue: { requested: playerIds?.length ?? "all", remindersSent, nudgesSent },
  });
  return { emailsSent, remindersSent, nudgesSent };
}

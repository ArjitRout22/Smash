import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import type { AuthUser } from "@/lib/auth/authorize";
import { sendTournamentReminderEmail } from "@/lib/email/notifications";

/**
 * Manual, admin-driven tournament reminders (no scheduled cron). An admin picks a
 * tournament and, optionally, a subset of its registered players; each player who
 * has a login account gets a reminder email. Sends are best-effort.
 */

function assertAdmin(actor: AuthUser) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden();
}

/** Upcoming tournaments an admin can remind, with their registered account-holders. */
export async function listReminderTargets(actor: AuthUser) {
  assertAdmin(actor);
  const tournaments = await prisma.tournament.findMany({
    where: { deletedAt: null, status: "upcoming" },
    select: {
      id: true,
      name: true,
      startDate: true,
      tournamentPlayers: {
        where: { status: "registered" },
        select: {
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
      // Only players with an account can receive an email.
      players: t.tournamentPlayers
        .filter((tp) => tp.player.user?.email)
        .map((tp) => ({ playerId: tp.player.id, name: tp.player.displayName })),
    }))
    .filter((t) => t.players.length > 0);
}

/** Send reminder emails to the chosen players (all registered, if none given). */
export async function sendTournamentReminders(
  actor: AuthUser,
  tournamentId: string,
  playerIds?: string[]
) {
  assertAdmin(actor);
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, name: true, startDate: true },
  });
  if (!t) throw Errors.notFound("Tournament");

  const rows = await prisma.tournamentPlayer.findMany({
    where: {
      tournamentId,
      status: "registered",
      ...(playerIds && playerIds.length ? { playerId: { in: playerIds } } : {}),
    },
    select: {
      player: { select: { displayName: true, user: { select: { email: true } } } },
    },
  });

  const now = new Date();
  const hours = t.startDate
    ? Math.max(1, Math.round((t.startDate.getTime() - now.getTime()) / 3_600_000))
    : 24;

  let sent = 0;
  for (const tp of rows) {
    const email = tp.player.user?.email;
    if (!email) continue;
    const ok = await sendTournamentReminderEmail({
      to: email,
      playerName: tp.player.displayName,
      tournamentName: t.name,
      tournamentId: t.id,
      startsInHours: hours,
    });
    if (ok) sent++;
  }

  await audit({
    actorUserId: actor.id,
    action: "reminders.sent",
    entityType: "Tournament",
    entityId: tournamentId,
    newValue: { requested: playerIds?.length ?? "all", sent },
  });
  return { emailsSent: sent };
}

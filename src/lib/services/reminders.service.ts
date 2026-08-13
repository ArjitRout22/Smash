import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import type { AuthUser } from "@/lib/auth/authorize";
import { sendTournamentReminderEmail } from "@/lib/email/notifications";

/**
 * Email registered account-holders about tournaments starting within the next
 * 24 hours. Driven by the daily reminder cron (`/api/cron/reminders`). Phase 1
 * has no per-send dedupe — the daily cadence means each tournament is reminded
 * about once, the day before it starts. Players without an account are skipped.
 */
export async function runTournamentReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tournaments = await prisma.tournament.findMany({
    where: {
      deletedAt: null,
      status: "upcoming",
      startDate: { gte: now, lte: soon },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      tournamentPlayers: {
        where: { status: "registered" },
        select: {
          player: { select: { displayName: true, user: { select: { email: true } } } },
        },
      },
    },
  });

  let sent = 0;
  for (const t of tournaments) {
    const hours = t.startDate
      ? Math.max(1, Math.round((t.startDate.getTime() - now.getTime()) / 3_600_000))
      : 24;
    for (const tp of t.tournamentPlayers) {
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
  }
  return { tournamentsDue: tournaments.length, emailsSent: sent };
}

/** Platform-admin on-demand trigger (replaces a scheduled cron). */
export async function triggerRemindersAsAdmin(actor: AuthUser) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden();
  const result = await runTournamentReminders();
  await audit({
    actorUserId: actor.id,
    action: "reminders.sent",
    entityType: "System",
    entityId: "reminders",
    newValue: result,
  });
  return result;
}

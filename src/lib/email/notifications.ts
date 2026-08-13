import { getEnv } from "@/lib/config/env";
import { getEmailProvider } from "@/lib/email/provider";

/**
 * Event + reminder emails, layered on the same EmailProvider as password reset.
 * Every send is best-effort: a delivery failure is logged, never thrown, so it
 * can't break the request (or a cron run) that triggered it.
 */

async function safeSend(msg: { to: string; subject: string; html: string; text: string }) {
  try {
    await getEmailProvider().send(msg);
    return true;
  } catch (err) {
    console.error("[notifications] email delivery failed:", err);
    return false;
  }
}

function shell(title: string, bodyHtml: string, cta?: { label: string; href: string }) {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#0f172a">${title}</h2>
    ${bodyHtml}
    ${cta ? `<p><a href="${cta.href}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${cta.label}</a></p>` : ""}
    <p style="color:#64748b;font-size:12px">Smash — badminton tournaments &amp; matches.</p>
  </div>`;
}

/** Sent when an account-holder is invited to a tournament. */
export async function sendTournamentInviteEmail(opts: {
  to: string;
  playerName: string;
  tournamentName: string;
  invitedByName?: string | null;
}) {
  const { APP_URL } = getEnv();
  const link = `${APP_URL}/dashboard`;
  const by = opts.invitedByName ? ` by ${opts.invitedByName}` : "";
  return safeSend({
    to: opts.to,
    subject: `You're invited to ${opts.tournamentName}`,
    text: `Hi ${opts.playerName},\n\nYou've been invited${by} to join "${opts.tournamentName}" on Smash. Open your dashboard to accept or decline:\n${link}\n`,
    html: shell(
      `You're invited to ${opts.tournamentName}`,
      `<p>Hi ${opts.playerName}, you've been invited${by} to join <strong>${opts.tournamentName}</strong>. Accept or decline it from your dashboard.</p>`,
      { label: "View invitation", href: link }
    ),
  });
}

/** Reminder that a tournament the player is in starts soon (from the cron). */
export async function sendTournamentReminderEmail(opts: {
  to: string;
  playerName: string;
  tournamentName: string;
  tournamentId: string;
  startsInHours: number;
}) {
  const { APP_URL } = getEnv();
  const link = `${APP_URL}/tournaments/${opts.tournamentId}`;
  return safeSend({
    to: opts.to,
    subject: `Reminder: ${opts.tournamentName} starts soon`,
    text: `Hi ${opts.playerName},\n\n"${opts.tournamentName}" starts in about ${opts.startsInHours} hour(s). Details:\n${link}\n`,
    html: shell(
      `${opts.tournamentName} starts soon`,
      `<p>Hi ${opts.playerName}, <strong>${opts.tournamentName}</strong> starts in about <strong>${opts.startsInHours} hour(s)</strong>. Good luck!</p>`,
      { label: "Open tournament", href: link }
    ),
  });
}

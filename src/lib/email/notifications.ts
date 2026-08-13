import { getEnv } from "@/lib/config/env";
import { getEmailProvider } from "@/lib/email/provider";

/**
 * Event + reminder emails, layered on the same EmailProvider as password reset.
 * Every send is best-effort: a delivery failure is logged, never thrown, so it
 * can't break the request (or an admin action) that triggered it.
 */

const BRAND = "#059669";

async function safeSend(msg: { to: string; subject: string; html: string; text: string }) {
  try {
    await getEmailProvider().send(msg);
    return true;
  } catch (err) {
    console.error("[notifications] email delivery failed:", err);
    return false;
  }
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
  } catch {
    return null;
  }
}

/** A branded, email-client-safe HTML shell (inline styles, table-based button). */
function shell(opts: {
  heading: string;
  intro: string;
  rows?: { label: string; value: string }[];
  cta: { label: string; href: string };
  outro?: string;
}): string {
  const rows = (opts.rows ?? [])
    .filter((r) => r.value)
    .map(
      (r) => `<tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${r.label}</td>
        <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600">${r.value}</td>
      </tr>`
    )
    .join("");
  return `
  <div style="background:#f1f5f4;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8e5;border-radius:14px;overflow:hidden">
      <div style="background:${BRAND};padding:16px 24px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px">🏸 Smash</div>
      <div style="padding:24px">
        <h1 style="margin:0 0 10px;font-size:19px;color:#0f172a;line-height:1.25">${opts.heading}</h1>
        <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6">${opts.intro}</p>
        ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows}</table>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${BRAND}">
          <a href="${opts.cta.href}" style="display:inline-block;padding:11px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${opts.cta.label}</a>
        </td></tr></table>
        ${opts.outro ? `<p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.6">${opts.outro}</p>` : ""}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #eef2f0;color:#94a3b8;font-size:11px">Smash — badminton tournaments &amp; matches · <a href="https://smashhero.app" style="color:#94a3b8">smashhero.app</a></div>
    </div>
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
    html: shell({
      heading: `You're invited to ${opts.tournamentName}`,
      intro: `Hi ${opts.playerName}, you've been invited${by} to join <strong>${opts.tournamentName}</strong>. Accept or decline it from your dashboard.`,
      cta: { label: "Accept or decline", href: link },
    }),
  });
}

/** Sent when a managed player is created by email — invites them to claim it. */
export async function sendPlayerClaimInviteEmail(opts: {
  to: string;
  playerName: string;
  invitedByName?: string | null;
}) {
  const { APP_URL } = getEnv();
  const link = `${APP_URL}/login?mode=register&email=${encodeURIComponent(opts.to)}`;
  const by = opts.invitedByName ? `${opts.invitedByName} added you` : "You've been added";
  return safeSend({
    to: opts.to,
    subject: "You've been added to Smash — claim your profile",
    text: `Hi ${opts.playerName},\n\n${by} to Smash (badminton tournaments & matches). Sign up with this email to claim your player profile — your matches and stats will be linked automatically:\n${link}\n`,
    html: shell({
      heading: "Claim your Smash profile",
      intro: `Hi ${opts.playerName}, ${by.toLowerCase()} to <strong>Smash</strong>. Sign up with <strong>${opts.to}</strong> and your player profile — matches, stats and any tournaments you're in — links automatically.`,
      cta: { label: "Sign up & claim", href: link },
      outro: "Already have an account? Just log in — this profile links to the matching email.",
    }),
  });
}

/** Nudge for a player who was invited but hasn't accepted/declined yet. */
export async function sendInviteReminderEmail(opts: {
  to: string;
  playerName: string;
  tournamentName: string;
  startDate?: Date | null;
  location?: string | null;
}) {
  const { APP_URL } = getEnv();
  const link = `${APP_URL}/dashboard`;
  const when = fmtDate(opts.startDate);
  return safeSend({
    to: opts.to,
    subject: `Reminder: respond to your invite for ${opts.tournamentName}`,
    text: `Hi ${opts.playerName},\n\nYou were invited to "${opts.tournamentName}" but haven't responded yet.${when ? ` It starts ${when}.` : ""} Please accept or decline:\n${link}\n`,
    html: shell({
      heading: `Still coming to ${opts.tournamentName}?`,
      intro: `Hi ${opts.playerName}, you were invited to <strong>${opts.tournamentName}</strong> but haven't responded yet. Let the organizer know so they can finalise the draw.`,
      rows: [
        { label: "Starts", value: when ?? "" },
        { label: "Location", value: opts.location ?? "" },
      ],
      cta: { label: "Accept or decline", href: link },
      outro: "If you can't make it, declining helps the organizer plan.",
    }),
  });
}

/** Reminder that a tournament a player has joined starts soon. */
export async function sendTournamentReminderEmail(opts: {
  to: string;
  playerName: string;
  tournamentName: string;
  tournamentId: string;
  startDate?: Date | null;
  location?: string | null;
}) {
  const { APP_URL } = getEnv();
  const link = `${APP_URL}/tournaments/${opts.tournamentId}`;
  const when = fmtDate(opts.startDate);
  return safeSend({
    to: opts.to,
    subject: `Reminder: ${opts.tournamentName} is coming up`,
    text: `Hi ${opts.playerName},\n\n"${opts.tournamentName}" is coming up${when ? ` — starts ${when}` : ""}.${opts.location ? ` Location: ${opts.location}.` : ""} Details:\n${link}\n\nGood luck!`,
    html: shell({
      heading: `${opts.tournamentName} is coming up`,
      intro: `Hi ${opts.playerName}, here's your reminder for <strong>${opts.tournamentName}</strong>. Good luck!`,
      rows: [
        { label: "Starts", value: when ?? "" },
        { label: "Location", value: opts.location ?? "" },
      ],
      cta: { label: "View tournament", href: link },
    }),
  });
}

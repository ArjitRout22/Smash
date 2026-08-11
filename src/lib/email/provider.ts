import { getEnv } from "@/lib/config/env";

/**
 * Email delivery abstraction — same pattern as the auth session layer, so the
 * backend can swap providers without touching call sites.
 *
 * - `console` (default): logs the email to the server console. Works with zero
 *   setup so password reset is functional in dev / before Resend is configured.
 * - `resend`: sends via the Resend REST API (free tier) — no SDK dependency.
 *
 * The provider is auto-selected: `resend` when RESEND_API_KEY is set, else console.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n📧 [email:console] To: ${message.to}\n   Subject: ${message.subject}\n   ${message.text}\n`
    );
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  async send(message: EmailMessage): Promise<void> {
    const env = getEnv();
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();
  const useResend = env.EMAIL_PROVIDER === "resend" || (env.EMAIL_PROVIDER === "auto" && env.RESEND_API_KEY);
  cached = useResend ? new ResendEmailProvider() : new ConsoleEmailProvider();
  return cached;
}

export function __resetEmailProvider() {
  cached = null;
}

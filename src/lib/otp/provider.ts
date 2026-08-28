import { getEnv } from "@/lib/config/env";

/**
 * OTP delivery abstraction — the ONLY provider-specific code in phone auth.
 * Everything else (generating the code, hashing, expiry, attempts, rate-limits,
 * sessions) lives in the OTP + auth services, so switching SMS providers is a
 * single new adapter here — no changes to auth, DB, or UI.
 *
 *   SmashHero auth → OTP service → OtpProvider → SMSLocal (or any provider)
 *
 * - `console` (default): logs the code to the server console — zero setup, so
 *   phone sign-in is testable in dev / before SMSLocal DLT is approved.
 * - `smslocal`: sends via SMSLocal's REST API. India is DLT-regulated, so the
 *   code goes through a pre-approved template (sender id + template id + a
 *   variable for the code).
 *
 * Auto-selected: `smslocal` when SMSLOCAL_API_KEY is set, else console.
 */
export interface OtpProvider {
  readonly name: string;
  sendCode(phone: string, code: string): Promise<void>;
}

class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  async sendCode(phone: string, code: string): Promise<void> {
    console.log(`\n📱 [otp:console] To: ${phone}\n   Your Smash code is: ${code}\n`);
  }
}

class SmsLocalProvider implements OtpProvider {
  readonly name = "smslocal";
  async sendCode(phone: string, code: string): Promise<void> {
    const env = getEnv();
    if (!env.SMSLOCAL_API_KEY) throw new Error("SMSLOCAL_API_KEY is not configured");
    if (!env.SMSLOCAL_SENDER_ID || !env.SMSLOCAL_TEMPLATE_ID) {
      throw new Error("SMSLOCAL_SENDER_ID and SMSLOCAL_TEMPLATE_ID are required (DLT)");
    }
    const res = await fetch("https://api.smslocal.in/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SMSLOCAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: env.SMSLOCAL_SENDER_ID,
        to: [phone],
        template_id: env.SMSLOCAL_TEMPLATE_ID,
        variables: { [env.SMSLOCAL_OTP_VAR]: code },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`SMSLocal send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  const env = getEnv();
  const useSmsLocal =
    env.OTP_PROVIDER === "smslocal" || (env.OTP_PROVIDER === "auto" && !!env.SMSLOCAL_API_KEY);
  cached = useSmsLocal ? new SmsLocalProvider() : new ConsoleOtpProvider();
  return cached;
}

export function __resetOtpProvider() {
  cached = null;
}

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { getEnv } from "@/lib/config/env";
import { rateLimiter } from "@/lib/ratelimit";
import { normalizePhone, maskPhone } from "@/lib/auth/phone";
import { getOtpProvider } from "@/lib/otp/provider";

type Ctx = { userAgent?: string | null; ip?: string | null };

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Send a fresh 6-digit code to `phoneRaw`. Rate-limited per phone AND per IP
 * (SMS costs money / anti-bombing). Never reveals whether an account exists.
 * Returns the E.164 phone and a masked form for display.
 */
export async function startOtp(phoneRaw: string, ctx?: Ctx): Promise<{ phone: string; masked: string }> {
  const phone = normalizePhone(phoneRaw);

  const perPhone = await rateLimiter.hit(`otp:send:${phone}`, 5, 900); // 5 / 15 min
  if (!perPhone.allowed) throw Errors.rateLimited("Too many code requests. Please wait a few minutes.");
  const perIp = await rateLimiter.hit(`otp:send-ip:${ctx?.ip ?? "?"}`, 20, 900);
  if (!perIp.allowed) throw Errors.rateLimited("Too many code requests. Please wait a few minutes.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ttl = getEnv().OTP_TTL_SECONDS;

  // Only the newest code for a phone is valid — retire any outstanding ones.
  await prisma.otpVerification.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.otpVerification.create({
    data: { phone, codeHash: hashCode(code), expiresAt: new Date(Date.now() + ttl * 1000) },
  });

  await getOtpProvider().sendCode(phone, code);
  return { phone, masked: maskPhone(phone) };
}

/**
 * Verify a code for `phoneRaw`. On success the E.164 phone is returned; otherwise
 * a generic error is thrown. Rate-limited per phone.
 *
 * By default a valid code is consumed (single-use). Pass `{ consume: false }` to
 * check validity WITHOUT consuming — used to probe a brand-new signup (decide
 * `needsProfile`) so the same code stays valid for the follow-up call that
 * actually creates the account. A wrong/expired code always throws either way,
 * so this never reveals whether an account exists.
 */
export async function verifyOtp(
  phoneRaw: string,
  code: string,
  ctx?: Ctx,
  opts: { consume?: boolean } = {}
): Promise<string> {
  const consume = opts.consume ?? true;
  const phone = normalizePhone(phoneRaw);

  const guard = await rateLimiter.hit(`otp:verify:${phone}:${ctx?.ip ?? "?"}`, 10, 900);
  if (!guard.allowed) throw Errors.rateLimited("Too many attempts. Please wait a few minutes.");

  const row = await prisma.otpVerification.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw Errors.validation("That code is invalid or has expired. Request a new one.");

  const attempts = row.attempts + 1;
  if (attempts > row.maxAttempts) {
    await prisma.otpVerification.update({ where: { id: row.id }, data: { consumedAt: new Date(), attempts } });
    throw Errors.validation("Too many wrong attempts. Request a new code.");
  }

  if (!constantTimeEqual(row.codeHash, hashCode(code))) {
    await prisma.otpVerification.update({ where: { id: row.id }, data: { attempts } });
    throw Errors.validation("That code is invalid or has expired. Request a new one.");
  }

  await prisma.otpVerification.update({
    where: { id: row.id },
    data: { attempts, ...(consume ? { consumedAt: new Date() } : {}) },
  });
  return phone;
}

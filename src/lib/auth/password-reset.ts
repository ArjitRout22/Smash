import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { rateLimiter } from "@/lib/ratelimit";
import { hashPassword } from "@/lib/auth/password";
import { getEmailProvider } from "@/lib/email/provider";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Step 1: request a reset link. Always resolves successfully (never reveals
 * whether an account exists). Rate-limited per email + IP.
 */
export async function requestPasswordReset(
  rawEmail: string,
  ctx?: { ip?: string | null }
): Promise<void> {
  const env = getEnv();
  const email = normalizeEmail(rawEmail);

  const guard = await rateLimiter.hit(`pwreset:${email}:${ctx?.ip ?? "?"}`, 5, 900);
  if (!guard.allowed) return; // silently drop excess requests

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || !user.isActive) return; // don't leak existence

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000);

  // Invalidate any outstanding tokens, then issue a fresh one.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const link = `${env.APP_URL}/reset-password?token=${token}`;
  const minutes = Math.round(env.PASSWORD_RESET_TTL_SECONDS / 60);
  // Never let a delivery failure 500 the request or reveal account existence —
  // the token is already stored; log the failure server-side and return quietly.
  try {
    await getEmailProvider().send({
      to: email,
      subject: "Reset your Smash password",
      text: `Reset your password using this link (valid ${minutes} minutes):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click the button below to set a new password. This link is valid for ${minutes} minutes.</p>
        <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
        <p style="color:#64748b;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    });
  } catch (err) {
    console.error("[password-reset] email delivery failed:", err);
  }
}

/** Step 2: consume a token and set a new password (revokes existing sessions). */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("VALIDATION_ERROR", "This reset link is invalid or has expired.");
  }

  const passwordHash = hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Force re-login everywhere for safety.
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

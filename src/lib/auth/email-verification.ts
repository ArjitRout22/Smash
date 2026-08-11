import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getEmailProvider } from "@/lib/email/provider";

const TTL_SECONDS = 60 * 60 * 24; // 24h

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a verification token and email the confirmation link. Best-effort send. */
export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const env = getEnv();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const link = `${env.APP_URL}/verify-email?token=${token}`;
  try {
    await getEmailProvider().send({
      to: email,
      subject: "Confirm your Smash email",
      text: `Welcome to Smash! Confirm your email:\n${link}\n\nIf you didn't sign up, you can ignore this.`,
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Welcome to Smash 🏸</h2>
        <p>Confirm your email address to finish setting up your account.</p>
        <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirm email</a></p>
        <p style="color:#64748b;font-size:12px">If you didn't sign up, you can safely ignore this email.</p>
      </div>`,
    });
  } catch (err) {
    console.error("[email-verification] delivery failed:", err);
  }
}

/** Consume a verification token and mark the user verified. */
export async function verifyEmail(token: string): Promise<void> {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("VALIDATION_ERROR", "This verification link is invalid or has expired.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

/** Re-send verification for a user who is not yet verified. */
export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user?.email || user.emailVerifiedAt) return; // nothing to do
  await sendVerificationEmail(userId, user.email);
}

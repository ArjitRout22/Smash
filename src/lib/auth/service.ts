import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError, Errors } from "@/lib/errors";
import { rateLimiter } from "@/lib/ratelimit";
import { normalizePhone } from "@/lib/auth/phone";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email-verification";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "club";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export type AuthResult = {
  token: string;
  expiresAt: Date;
  user: { id: string; email: string | null; name: string | null; role: string };
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Create an account (defaults to the PLAYER role) and start a session. */
export async function register(
  input: { name: string; email: string; password: string; phone?: string },
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : undefined;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Errors.conflict("An account with this email already exists");

  const passwordHash = hashPassword(input.password);

  // Each signup gets their own workspace (organization) and becomes its
  // ORGANIZER, so they can immediately create and run their own tournaments.
  const user = await prisma.$transaction(async (tx) => {
    const organizerRole = await tx.role.upsert({
      where: { name: "ORGANIZER" },
      update: {},
      create: { name: "ORGANIZER", description: "Owns and runs a workspace" },
    });
    const org = await tx.organization.create({
      data: { name: `${input.name.split(" ")[0] || input.name}'s Club`, slug: slugify(input.name) },
    });
    const player = await tx.player.create({
      data: {
        fullName: input.name,
        displayName: input.name.split(" ")[0] || input.name,
        phone,
        organizationId: org.id,
      },
    });
    return tx.user.create({
      data: {
        email,
        passwordHash,
        phone,
        name: input.name,
        roleId: organizerRole.id,
        organizationId: org.id,
        playerId: player.id,
        lastLoginAt: new Date(),
      },
      include: { role: true },
    });
  });

  // Send the email-confirmation link (best-effort; never blocks signup).
  await sendVerificationEmail(user.id, email);

  const { token, expiresAt } = await createSession({ id: user.id, role: user.role.name }, ctx);
  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } };
}

/** Verify email + password and start a session. Rate-limited to deter brute force. */
export async function login(
  input: { email: string; password: string },
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<AuthResult> {
  const email = normalizeEmail(input.email);

  // Throttle attempts per email + IP.
  const guard = await rateLimiter.hit(`login:${email}:${ctx?.ip ?? "?"}`, 10, 300);
  if (!guard.allowed) {
    throw Errors.rateLimited("Too many attempts. Please wait a moment and try again.");
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  // Constant-ish work whether or not the user exists; always generic error.
  const ok = user ? verifyPassword(input.password, user.passwordHash) : verifyPassword(input.password, null);
  if (!user || !ok) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }
  if (user.deletedAt || !user.isActive) {
    throw Errors.forbidden("This account is disabled.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await rateLimiter.reset(`login:${email}:${ctx?.ip ?? "?"}`);

  const { token, expiresAt } = await createSession({ id: user.id, role: user.role.name }, ctx);
  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } };
}

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError, Errors } from "@/lib/errors";
import { rateLimiter } from "@/lib/ratelimit";
import { normalizePhone } from "@/lib/auth/phone";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email-verification";
import { verifyOtp } from "@/lib/auth/otp";

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
    // If an organizer pre-created a managed player for this email (invite-by-
    // email), claim that record — so the person's existing tournament entries +
    // stats carry over — instead of minting a duplicate. Otherwise create fresh.
    const pending = await tx.player.findFirst({
      where: { invitedEmail: email, deletedAt: null, user: { is: null } },
    });
    const player = pending
      ? await tx.player.update({
          where: { id: pending.id },
          data: { invitedEmail: null, organizationId: org.id, phone: phone ?? pending.phone },
        })
      : await tx.player.create({
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
        // Consent captured at signup (Terms + name/results marketing use). The
        // route enforces the checkbox, so reaching here means it was accepted.
        termsAcceptedAt: new Date(),
      },
      include: { role: true },
    });
  });

  // Send the email-confirmation link (best-effort; never blocks signup).
  await sendVerificationEmail(user.id, email);

  const { token, expiresAt } = await createSession({ id: user.id, role: user.role.name }, ctx);
  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } };
}

/**
 * Phone + OTP sign-in — a full alternative to email+password. Verifies the code,
 * then EITHER logs into the account already owning that phone, OR (new phone)
 * creates one exactly like an email signup (own Organization + ORGANIZER). A new
 * phone needs a name + Terms; when they're missing we return `needsProfile` so the
 * UI can collect them instead of failing.
 */
export async function authByPhone(
  input: { phone: string; code: string; name?: string; email?: string; acceptedTerms?: boolean },
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<(AuthResult & { hasPassword: boolean }) | { needsProfile: true }> {
  const phone = normalizePhone(input.phone);
  const existing = await prisma.user.findUnique({ where: { phone }, include: { role: true } });

  const name = input.name?.trim();
  const hasProfile = !!name && name.length >= 2 && input.acceptedTerms === true;

  // Brand-new phone that hasn't supplied profile details yet: verify the code to
  // prove ownership but DON'T consume it, so the follow-up call (with name + Terms)
  // can reuse the same code to finish signup. The UI verifies twice for new users.
  if (!existing && !hasProfile) {
    await verifyOtp(input.phone, input.code, ctx, { consume: false });
    return { needsProfile: true };
  }

  // Completing sign-in or sign-up — verify AND consume the one-time code now.
  await verifyOtp(input.phone, input.code, ctx);

  if (existing) {
    if (existing.deletedAt || !existing.isActive) throw Errors.forbidden("This account is disabled.");
    await prisma.user.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date(), phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date() },
    });
    const { token, expiresAt } = await createSession({ id: existing.id, role: existing.role.name }, ctx);
    return {
      token,
      expiresAt,
      user: { id: existing.id, email: existing.email, name: existing.name, role: existing.role.name },
      hasPassword: existing.passwordHash != null,
    };
  }

  // New phone → create the account (mirrors register()). name + Terms already
  // validated above (hasProfile), and the code has now been consumed.
  if (!name) throw Errors.validation("Your name is required.");
  const email = input.email ? normalizeEmail(input.email) : undefined;
  if (email && (await prisma.user.findUnique({ where: { email } }))) {
    throw Errors.conflict("An account with this email already exists");
  }

  const user = await prisma.$transaction(async (tx) => {
    const organizerRole = await tx.role.upsert({
      where: { name: "ORGANIZER" },
      update: {},
      create: { name: "ORGANIZER", description: "Owns and runs a workspace" },
    });
    const org = await tx.organization.create({
      data: { name: `${name.split(" ")[0] || name}'s Club`, slug: slugify(name) },
    });
    const pending = email
      ? await tx.player.findFirst({ where: { invitedEmail: email, deletedAt: null, user: { is: null } } })
      : null;
    const player = pending
      ? await tx.player.update({
          where: { id: pending.id },
          data: { invitedEmail: null, organizationId: org.id, phone },
        })
      : await tx.player.create({
          data: { fullName: name, displayName: name.split(" ")[0] || name, phone, organizationId: org.id },
        });
    return tx.user.create({
      data: {
        email,
        phone,
        phoneVerifiedAt: new Date(),
        name,
        roleId: organizerRole.id,
        organizationId: org.id,
        playerId: player.id,
        lastLoginAt: new Date(),
        termsAcceptedAt: new Date(),
      },
      include: { role: true },
    });
  });

  if (email) await sendVerificationEmail(user.id, email).catch(() => undefined);
  const { token, expiresAt } = await createSession({ id: user.id, role: user.role.name }, ctx);
  return {
    token,
    expiresAt,
    user: { id: user.id, email: user.email, name: user.name, role: user.role.name },
    hasPassword: false, // just created — offer to set one
  };
}

/** Link a verified phone to an existing (e.g. email) account so they can also log in by phone. */
export async function addVerifiedPhone(
  userId: string,
  phoneRaw: string,
  code: string,
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<{ phone: string }> {
  const phone = await verifyOtp(phoneRaw, code, ctx);
  const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
  if (taken) throw Errors.conflict("That phone number is already linked to another account");
  const user = await prisma.user.update({
    where: { id: userId },
    data: { phone, phoneVerifiedAt: new Date() },
    select: { playerId: true },
  });
  if (user.playerId) {
    await prisma.player.update({ where: { id: user.playerId }, data: { phone } }).catch(() => undefined);
  }
  return { phone };
}

/**
 * Verify email OR phone + password and start a session. Rate-limited to deter
 * brute force. Phone-signup users who set a password log in here too.
 */
export async function login(
  input: { identifier: string; password: string },
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<AuthResult> {
  const raw = input.identifier.trim();

  // An "@" means email; otherwise treat it as a phone number.
  let where: { email: string } | { phone: string } | null = null;
  let rlId = raw.toLowerCase();
  if (raw.includes("@")) {
    where = { email: normalizeEmail(raw) };
    rlId = where.email;
  } else {
    try {
      const phone = normalizePhone(raw);
      where = { phone };
      rlId = phone;
    } catch {
      where = null; // invalid phone → no user; still do constant-ish work below
    }
  }

  const rlKey = `login:${rlId}:${ctx?.ip ?? "?"}`;
  const guard = await rateLimiter.hit(rlKey, 10, 300);
  if (!guard.allowed) {
    throw Errors.rateLimited("Too many attempts. Please wait a moment and try again.");
  }

  const user = where ? await prisma.user.findUnique({ where, include: { role: true } }) : null;

  // Constant-ish work whether or not the user exists; always generic error.
  const ok = user ? verifyPassword(input.password, user.passwordHash) : verifyPassword(input.password, null);
  if (!user || !ok) {
    throw new AppError("UNAUTHORIZED", "Invalid login details");
  }
  if (user.deletedAt || !user.isActive) {
    throw Errors.forbidden("This account is disabled.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await rateLimiter.reset(rlKey);

  const { token, expiresAt } = await createSession({ id: user.id, role: user.role.name }, ctx);
  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } };
}

/**
 * Set (or change) the account password. A phone-signup user with no password can
 * set one to log in without a code; changing an existing password requires the
 * current one.
 */
export async function setPassword(userId: string, newPassword: string, currentPassword?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw Errors.notFound("Account");
  if (user.passwordHash) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      throw Errors.validation("Your current password is incorrect");
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } });
}

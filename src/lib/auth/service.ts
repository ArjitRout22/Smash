import { prisma } from "@/lib/db/prisma";
import { AppError, Errors } from "@/lib/errors";
import { rateLimiter } from "@/lib/ratelimit";
import { normalizePhone } from "@/lib/auth/phone";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

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

  const user = await prisma.$transaction(async (tx) => {
    const playerRole = await tx.role.upsert({
      where: { name: "PLAYER" },
      update: {},
      create: { name: "PLAYER", description: "Default self-service role" },
    });
    const player = await tx.player.create({
      data: { fullName: input.name, displayName: input.name.split(" ")[0] || input.name, phone },
    });
    return tx.user.create({
      data: {
        email,
        passwordHash,
        phone,
        name: input.name,
        roleId: playerRole.id,
        playerId: player.id,
        lastLoginAt: new Date(),
      },
      include: { role: true },
    });
  });

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

import { SignJWT, jwtVerify } from "jose";
import { createHash, randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getEnv, isProd } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

export { SESSION_COOKIE };

type SessionClaims = {
  sub: string; // userId
  role: string; // role name
  jti: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

function hashJti(jti: string): string {
  return createHash("sha256").update(jti).digest("hex");
}

/**
 * Issue a session: sign a JWT and persist a revocable Session row keyed by a
 * hash of the token id. Returns the token and its expiry.
 */
export async function createSession(
  user: { id: string; role: string },
  ctx?: { userAgent?: string | null; ip?: string | null }
): Promise<{ token: string; expiresAt: Date }> {
  const env = getEnv();
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + env.SESSION_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000);

  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashJti(jti),
      userAgent: ctx?.userAgent ?? null,
      ip: ctx?.ip ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * Verify a token cryptographically AND confirm the session is still active
 * (not revoked, not expired) in the DB. Returns the claims or null.
 */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || !payload.jti) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashJti(payload.jti) },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

    return {
      sub: payload.sub,
      jti: payload.jti,
      role: (payload.role as string) ?? "PLAYER",
    };
  } catch {
    return null;
  }
}

export async function revokeSession(jti: string): Promise<void> {
  await prisma.session
    .update({ where: { tokenHash: hashJti(jti) }, data: { revokedAt: new Date() } })
    .catch(() => undefined); // already gone → idempotent
}

// --- Cookie helpers ---------------------------------------------------------

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function attachSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

/** Read the raw session token from the incoming request cookies. */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

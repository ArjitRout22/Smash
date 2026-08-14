import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { readSessionToken, verifySession } from "@/lib/auth/session";
import {
  permissionsForRole,
  type PermissionKey,
} from "@/lib/auth/permissions";

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  name: string | null;
  displayName?: string | null; // the linked player's short/display name, if any
  role: string;
  organizationId: string | null;
  playerId: string | null;
  permissions: PermissionKey[];
};

/** Load the current authenticated user, or null if not signed in. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const user = await prisma.user.findFirst({
    where: { id: claims.sub, deletedAt: null, isActive: true },
    include: { role: true, player: { select: { displayName: true } } },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt != null,
    phone: user.phone,
    name: user.name,
    displayName: user.player?.displayName ?? null,
    role: user.role.name,
    organizationId: user.organizationId,
    playerId: user.playerId,
    permissions: permissionsForRole(user.role.name),
  };
}

/** Require an authenticated user or throw UNAUTHORIZED. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

export function hasPermission(user: AuthUser, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}

/** Require an authenticated user holding a specific permission. */
export async function requirePermission(permission: PermissionKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    throw Errors.forbidden();
  }
  return user;
}

export function assertPermission(user: AuthUser, permission: PermissionKey): void {
  if (!hasPermission(user, permission)) throw Errors.forbidden();
}

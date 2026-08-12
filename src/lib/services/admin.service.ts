import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import type { AuthUser } from "@/lib/auth/authorize";

/** Platform-admin: list accounts for review/cleanup (newest first). */
export async function listAllUsers(actor: AuthUser, search?: string) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden();
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      role: { select: { name: true } },
      player: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

/**
 * Platform-admin: soft-delete a test account. Reversible — sets deletedAt +
 * deactivates login, soft-deletes the linked player (so it drops out of the
 * directory + leaderboard), and revokes sessions. Does NOT hard-delete rows.
 */
export async function softDeleteUser(actor: AuthUser, userId: string) {
  if (!isPlatformAdmin(actor)) throw Errors.forbidden();
  if (userId === actor.id) throw Errors.validation("You can't delete your own account here.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, playerId: true, role: { select: { name: true } } } });
  if (!user) throw Errors.notFound("User");
  if (user.role.name === "ADMIN") throw Errors.validation("Refusing to delete a platform admin account.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deletedAt: now, isActive: false } });
    if (user.playerId) await tx.player.update({ where: { id: user.playerId }, data: { deletedAt: now } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  });
  await audit({ actorUserId: actor.id, action: "admin.user.soft_deleted", entityType: "User", entityId: userId });
  return { softDeleted: true };
}

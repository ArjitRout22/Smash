import type { AuthUser } from "@/lib/auth/authorize";
import { Errors } from "@/lib/errors";

/**
 * Multi-tenancy helpers. Each ORGANIZER/PLAYER is scoped to their own
 * organization; a platform ADMIN (no org scoping) can see everything.
 *
 * Two layers of protection, both required:
 *  - orgFilter(): narrows LIST queries to the caller's org.
 *  - assertOrgAccess(): object-level check on GET/mutate-by-id (stops a user
 *    from reaching another org's record by guessing its id — IDOR).
 */
export function isPlatformAdmin(actor: AuthUser): boolean {
  return actor.role === "ADMIN";
}

/** A Prisma `where` fragment that scopes a query to the caller's org. */
export function orgFilter(actor: AuthUser): { organizationId?: string } {
  if (isPlatformAdmin(actor)) return {};
  // A scoped user with no org can see nothing (defensive; signups always get one).
  return { organizationId: actor.organizationId ?? "__no_org__" };
}

/** Throw FORBIDDEN unless the caller may access a resource in `resourceOrgId`. */
export function assertOrgAccess(actor: AuthUser, resourceOrgId: string | null): void {
  if (isPlatformAdmin(actor)) return;
  if (!resourceOrgId || resourceOrgId !== actor.organizationId) {
    throw Errors.forbidden("You don't have access to this resource");
  }
}

/** The org a newly-created resource should belong to (caller's org). */
export function ownOrgId(actor: AuthUser): string | null {
  return actor.organizationId ?? null;
}

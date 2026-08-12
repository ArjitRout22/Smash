import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { softDeleteUser } from "@/lib/services/admin.service";

// Platform-admin only (enforced in the service): soft-delete a test account.
export const DELETE = route<{ id: string }>(async (_req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requireUser();
  const { id } = await params;
  return ok(await softDeleteUser(actor, id));
});

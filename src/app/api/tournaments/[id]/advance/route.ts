import { route, type RouteContext } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { advanceGroupsToKnockout } from "@/lib/services/stage.service";

type Ctx = RouteContext<{ id: string }>;

// Owner: auto-advance a completed group stage into a seeded knockout.
export const POST = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.STAGE_MANAGE);
  const { id } = await params;
  return created(await advanceGroupsToKnockout(id, actor));
});

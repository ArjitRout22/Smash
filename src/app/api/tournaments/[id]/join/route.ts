import { route, type RouteContext } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requestToJoin } from "@/lib/services/tournament.service";

// A signed-in player requests to join a public tournament.
export const POST = route<{ id: string }>(async (_req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  const { id } = await params;
  return created(await requestToJoin(actor, id));
});

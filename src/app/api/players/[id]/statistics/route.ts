import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPlayerStatistics } from "@/lib/services/player.service";

export const GET = route<{ id: string }>(async (_req, { params }: RouteContext<{ id: string }>) => {
  await requirePermission(PERMISSIONS.PLAYER_VIEW);
  const { id } = await params;
  return ok(await getPlayerStatistics(id));
});

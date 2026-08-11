import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPlayerMatches } from "@/lib/services/player.service";

export const GET = route<{ id: string }>(async (req, { params }: RouteContext<{ id: string }>) => {
  await requirePermission(PERMISSIONS.PLAYER_VIEW);
  const { id } = await params;
  const p = parsePagination(new URL(req.url).searchParams);
  const { items, total } = await getPlayerMatches(id, p);
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

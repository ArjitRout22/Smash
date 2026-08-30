import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPlayerLeaderboard } from "@/lib/services/leaderboard.service";

export const GET = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.LEADERBOARD_VIEW);
  const url = new URL(req.url);
  const p = parsePagination(url.searchParams);
  const { items, total } = await getPlayerLeaderboard(actor, p, {
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
  });
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

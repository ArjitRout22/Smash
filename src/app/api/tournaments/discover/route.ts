import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listPublicTournaments } from "@/lib/services/tournament.service";

// Cross-workspace list of public tournaments anyone can discover + join.
export const GET = route(async (req) => {
  await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  const url = new URL(req.url);
  const p = parsePagination(url.searchParams);
  const { items, total } = await listPublicTournaments(p, {
    status: url.searchParams.get("status") ?? undefined,
  });
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

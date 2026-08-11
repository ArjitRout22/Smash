import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateMatchSchema } from "@/lib/validation/schemas";
import { listMatches, createMatch } from "@/lib/services/match.service";

export const GET = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_VIEW);
  const url = new URL(req.url);
  const p = parsePagination(url.searchParams);
  const { items, total } = await listMatches(actor, p, {
    tournamentId: url.searchParams.get("tournamentId") ?? undefined,
    stageId: url.searchParams.get("stageId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

export const POST = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_MANAGE);
  const input = CreateMatchSchema.parse(await readJson(req));
  return created(await createMatch(input, actor));
});

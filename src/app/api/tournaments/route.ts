import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateTournamentSchema } from "@/lib/validation/schemas";
import { listTournaments, createTournament } from "@/lib/services/tournament.service";

export const GET = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  const url = new URL(req.url);
  const p = parsePagination(url.searchParams);
  const status = url.searchParams.get("status") ?? undefined;
  const { items, total } = await listTournaments(actor, p, { status });
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

export const POST = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_CREATE);
  const input = CreateTournamentSchema.parse(await readJson(req));
  const tournament = await createTournament(input, actor);
  return created(tournament);
});

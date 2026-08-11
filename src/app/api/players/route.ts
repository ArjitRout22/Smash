import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreatePlayerSchema } from "@/lib/validation/schemas";
import { listPlayers, createPlayer } from "@/lib/services/player.service";

export const GET = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.PLAYER_VIEW);
  const url = new URL(req.url);
  const p = parsePagination(url.searchParams);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const { items, total } = await listPlayers(actor, p, { scope });
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

export const POST = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.PLAYER_MANAGE);
  const input = CreatePlayerSchema.parse(await readJson(req));
  return created(await createPlayer(input, actor));
});

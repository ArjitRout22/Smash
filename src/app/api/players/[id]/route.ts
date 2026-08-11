import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { UpdatePlayerSchema } from "@/lib/validation/schemas";
import { getPlayer, updatePlayer } from "@/lib/services/player.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.PLAYER_VIEW);
  const { id } = await params;
  return ok(await getPlayer(actor, id));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.PLAYER_MANAGE);
  const { id } = await params;
  const input = UpdatePlayerSchema.parse(await readJson(req));
  return ok(await updatePlayer(id, input, actor));
});

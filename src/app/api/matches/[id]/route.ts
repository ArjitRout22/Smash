import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { UpdateMatchSchema } from "@/lib/validation/schemas";
import { getMatch, updateMatch, softDeleteMatch } from "@/lib/services/match.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_VIEW);
  const { id } = await params;
  return ok(await getMatch(actor, id));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_MANAGE);
  const { id } = await params;
  const input = UpdateMatchSchema.parse(await readJson(req));
  return ok(await updateMatch(id, input, actor));
});

export const DELETE = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_MANAGE);
  const { id } = await params;
  await softDeleteMatch(id, actor);
  return ok({ deleted: true });
});

import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { UpdateTeamSchema } from "@/lib/validation/schemas";
import { getTeam, updateTeam, deleteTeam } from "@/lib/services/team.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_VIEW);
  const { id } = await params;
  return ok(await getTeam(actor, id));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const { id } = await params;
  const input = UpdateTeamSchema.parse(await readJson(req));
  return ok(await updateTeam(id, input, actor));
});

export const DELETE = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const { id } = await params;
  await deleteTeam(id, actor);
  return ok({ deleted: true });
});

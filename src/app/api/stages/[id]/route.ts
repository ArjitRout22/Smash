import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { UpdateStageSchema } from "@/lib/validation/schemas";
import { updateStage } from "@/lib/services/stage.service";

export const PUT = route<{ id: string }>(async (req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requirePermission(PERMISSIONS.STAGE_MANAGE);
  const { id } = await params;
  const input = UpdateStageSchema.parse(await readJson(req));
  return ok(await updateStage(id, input, actor));
});

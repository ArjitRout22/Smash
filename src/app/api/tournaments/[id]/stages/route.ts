import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateStageSchema } from "@/lib/validation/schemas";
import { listStages, createStage } from "@/lib/services/stage.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  await requirePermission(PERMISSIONS.STAGE_VIEW);
  const { id } = await params;
  return ok(await listStages(id));
});

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.STAGE_MANAGE);
  const { id } = await params;
  const input = CreateStageSchema.parse(await readJson(req));
  return created(await createStage(id, input, actor));
});

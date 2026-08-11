import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { SubmitScoreSchema } from "@/lib/validation/schemas";
import { submitScore } from "@/lib/services/score.service";

type Ctx = RouteContext<{ id: string }>;

// Submit (POST) or correct (PUT) a match score — same transactional path.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.SCORE_EDIT);
  const { id } = await params;
  const input = SubmitScoreSchema.parse(await readJson(req));
  return ok(await submitScore(id, input, actor.id));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.SCORE_EDIT);
  const { id } = await params;
  const input = SubmitScoreSchema.parse(await readJson(req));
  return ok(await submitScore(id, input, actor.id));
});

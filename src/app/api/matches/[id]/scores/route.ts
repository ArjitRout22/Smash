import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { SubmitScoreSchema } from "@/lib/validation/schemas";
import { submitScore, resetMatchResult } from "@/lib/services/score.service";

type Ctx = RouteContext<{ id: string }>;

// Submit (POST) or correct (PUT) a match score — same transactional path.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.SCORE_EDIT);
  const { id } = await params;
  const input = SubmitScoreSchema.parse(await readJson(req));
  return ok(await submitScore(id, input, actor));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.SCORE_EDIT);
  const { id } = await params;
  const input = SubmitScoreSchema.parse(await readJson(req));
  return ok(await submitScore(id, input, actor));
});

// Clear a match's result and put it back to "scheduled" (undo a mistaken score).
// Recomputes the leaderboard + affected player stats.
export const DELETE = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.SCORE_EDIT);
  const { id } = await params;
  return ok(await resetMatchResult(actor, id));
});

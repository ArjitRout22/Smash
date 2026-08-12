import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { removeScorer } from "@/lib/services/tournament.service";

type Ctx = RouteContext<{ id: string; userId: string }>;

// Owner: remove a nominated scorer.
export const DELETE = route<{ id: string; userId: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id, userId } = await params;
  await removeScorer(actor, id, userId);
  return ok({ removed: true });
});

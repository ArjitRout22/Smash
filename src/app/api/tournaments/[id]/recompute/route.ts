import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recomputeTournament } from "@/lib/services/tournament.service";

// Owner/admin: recompute this tournament's standings + player stats (titles, etc.).
export const POST = route<{ id: string }>(async (_req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  return ok(await recomputeTournament(actor, id));
});

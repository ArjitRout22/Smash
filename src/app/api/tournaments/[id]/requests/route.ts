import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { RespondJoinRequestSchema } from "@/lib/validation/schemas";
import { listJoinRequests, respondToJoinRequest } from "@/lib/services/tournament.service";

type Ctx = RouteContext<{ id: string }>;

// Organizer: list pending join requests.
export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  return ok(await listJoinRequests(actor, id));
});

// Organizer: accept or decline a join request.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  const { playerId, action } = RespondJoinRequestSchema.parse(await readJson(req));
  return ok(await respondToJoinRequest(actor, id, playerId, action));
});

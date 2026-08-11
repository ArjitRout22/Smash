import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { removeParticipant } from "@/lib/services/tournament.service";

// Organizer: remove a participant (or a request) from their tournament.
export const DELETE = route<{ id: string; playerId: string }>(
  async (_req, { params }: RouteContext<{ id: string; playerId: string }>) => {
    const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
    const { id, playerId } = await params;
    await removeParticipant(actor, id, playerId);
    return ok({ removed: true });
  }
);

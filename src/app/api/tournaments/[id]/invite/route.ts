import { z } from "zod";
import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { inviteToTournament } from "@/lib/services/tournament.service";

const Body = z.object({ playerId: z.string().uuid() });

// Organizer invites a registered player (from anywhere) to their tournament.
export const POST = route<{ id: string }>(async (req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  const { playerId } = Body.parse(await readJson(req));
  return created(await inviteToTournament(actor, id, playerId));
});

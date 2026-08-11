import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listMyInvitations, respondToInvitation } from "@/lib/services/tournament.service";

const Body = z.object({
  tournamentId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

// The current user's pending tournament invitations.
export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await listMyInvitations(actor));
});

// Accept or decline an invitation.
export const POST = route(async (req) => {
  const actor = await requireUser();
  const { tournamentId, action } = Body.parse(await readJson(req));
  return ok(await respondToInvitation(actor, tournamentId, action));
});

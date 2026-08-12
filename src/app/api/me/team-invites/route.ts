import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listMyTeamInvites, respondToTeamInvite } from "@/lib/services/team.service";

const Body = z.object({
  teamId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

// The current user's pending team invitations.
export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await listMyTeamInvites(actor));
});

// Accept or decline a team invitation.
export const POST = route(async (req) => {
  const actor = await requireUser();
  const { teamId, action } = Body.parse(await readJson(req));
  return ok(await respondToTeamInvite(actor, teamId, action));
});

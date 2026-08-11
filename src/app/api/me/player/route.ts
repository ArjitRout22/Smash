import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { UpdateOwnPlayerSchema } from "@/lib/validation/schemas";
import { updateOwnPlayer } from "@/lib/services/player.service";

// Self-service: the current user edits their OWN linked player profile
// (display name, city, self-declared skill level). No PLAYER_MANAGE needed.
export const PUT = route(async (req) => {
  const actor = await requireUser();
  const input = UpdateOwnPlayerSchema.parse(await readJson(req));
  return ok(await updateOwnPlayer(actor, input));
});

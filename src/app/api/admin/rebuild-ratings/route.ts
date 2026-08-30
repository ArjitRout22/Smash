import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { rebuildRatingsAsAdmin } from "@/lib/services/rating.service";

// Platform-admin only (enforced in the service): reset + replay all rated matches
// chronologically and rebuild the rating history. Use after historical data changes.
export const POST = route(async () => {
  const actor = await requireUser();
  return ok(await rebuildRatingsAsAdmin(actor));
});

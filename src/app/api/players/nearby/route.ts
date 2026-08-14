import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listNearbyPlayers } from "@/lib/services/play.service";

export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await listNearbyPlayers(actor));
});

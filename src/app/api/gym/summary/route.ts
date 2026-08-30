import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { getMyGymSummary } from "@/lib/services/gym.service";

export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await getMyGymSummary(actor));
});

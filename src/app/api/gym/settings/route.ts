import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { GymSettingsSchema } from "@/lib/validation/schemas";
import { updateGymSettings } from "@/lib/services/gym.service";

export const PUT = route(async (req) => {
  const actor = await requireUser();
  const input = GymSettingsSchema.parse(await readJson(req));
  return ok(await updateGymSettings(actor, input));
});

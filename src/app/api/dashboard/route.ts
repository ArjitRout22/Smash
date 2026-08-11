import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { getDashboard } from "@/lib/services/dashboard.service";

export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await getDashboard(actor));
});

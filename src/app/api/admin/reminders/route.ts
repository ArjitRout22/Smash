import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { triggerRemindersAsAdmin } from "@/lib/services/reminders.service";

// Platform-admin on-demand: email registered players about tournaments starting
// within 24h. Manual trigger (no cron) — enforced in the service.
export const POST = route(async () => {
  const actor = await requireUser();
  return ok(await triggerRemindersAsAdmin(actor));
});

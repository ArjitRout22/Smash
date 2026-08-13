import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listReminderTargets, sendTournamentReminders } from "@/lib/services/reminders.service";

// Platform-admin only (enforced in the service). GET lists remindable tournaments
// + their players; POST sends reminder emails to the chosen recipients.
export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await listReminderTargets(actor));
});

const Body = z.object({
  tournamentId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()).optional(),
});

export const POST = route(async (req) => {
  const actor = await requireUser();
  const { tournamentId, playerIds } = Body.parse(await readJson(req));
  return ok(await sendTournamentReminders(actor, tournamentId, playerIds));
});

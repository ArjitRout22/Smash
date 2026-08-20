import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listInvitableTournaments } from "@/lib/services/tournament.service";

// Tournaments the caller can invite players into (own, still-open). Used by the
// dashboard "Invite a player" shortcut.
export const GET = route(async () => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  return ok(await listInvitableTournaments(actor));
});

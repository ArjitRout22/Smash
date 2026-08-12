import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listAllUsers } from "@/lib/services/admin.service";

// Platform-admin only (enforced in the service): list accounts for cleanup.
export const GET = route(async (req) => {
  const actor = await requireUser();
  const url = new URL(req.url);
  return ok(await listAllUsers(actor, url.searchParams.get("search")?.trim() || undefined));
});

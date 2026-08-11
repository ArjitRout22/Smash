import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { listCasualOpponents } from "@/lib/services/casual-match.service";

// Players who can be challenged: anyone (else) with a login account.
export const GET = route(async (req) => {
  const actor = await requireUser();
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() || undefined;
  return ok(await listCasualOpponents(actor, search));
});

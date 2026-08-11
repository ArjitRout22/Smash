import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { CasualMatchActionSchema } from "@/lib/validation/schemas";
import { getCasualMatch, actOnCasualMatch } from "@/lib/services/casual-match.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  return ok(await getCasualMatch(actor, id));
});

// State transitions: accept | decline | confirm | reject | cancel | reopen.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  const input = CasualMatchActionSchema.parse(await readJson(req));
  return ok(await actOnCasualMatch(actor, id, input));
});

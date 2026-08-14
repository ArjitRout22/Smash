import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { PlayRequestActionSchema } from "@/lib/validation/schemas";
import { actOnPlayRequest } from "@/lib/services/play.service";

type Ctx = RouteContext<{ id: string }>;

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  const { action } = PlayRequestActionSchema.parse(await readJson(req));
  return ok(await actOnPlayRequest(actor, id, action));
});

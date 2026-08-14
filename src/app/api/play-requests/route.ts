import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { CreatePlayRequestSchema } from "@/lib/validation/schemas";
import { listMyPlayRequests, sendPlayRequest } from "@/lib/services/play.service";

export const GET = route(async () => {
  const actor = await requireUser();
  return ok(await listMyPlayRequests(actor));
});

export const POST = route(async (req) => {
  const actor = await requireUser();
  const input = CreatePlayRequestSchema.parse(await readJson(req));
  return created(await sendPlayRequest(actor, input.toPlayerId, input.note));
});

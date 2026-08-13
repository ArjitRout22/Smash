import { z } from "zod";
import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { setLiveScore } from "@/lib/services/match.service";

const Body = z.object({
  a: z.number().int().min(0).max(99),
  b: z.number().int().min(0).max(99),
});

// Scorer sets the cosmetic live running score for the spectator view.
export const POST = route<{ id: string }>(async (req, { params }: RouteContext<{ id: string }>) => {
  const actor = await requireUser();
  const { id } = await params;
  const { a, b } = Body.parse(await readJson(req));
  return ok(await setLiveScore(actor, id, a, b));
});

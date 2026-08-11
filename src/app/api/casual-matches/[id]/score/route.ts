import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { ReportCasualScoreSchema } from "@/lib/validation/schemas";
import { reportCasualScore } from "@/lib/services/casual-match.service";

type Ctx = RouteContext<{ id: string }>;

// Report a completed result → moves the match to awaiting the other player's
// confirmation. The opponent must confirm before it counts as completed.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  const input = ReportCasualScoreSchema.parse(await readJson(req));
  return ok(await reportCasualScore(actor, id, input));
});

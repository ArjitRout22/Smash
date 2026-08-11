import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { GenerateBracketSchema } from "@/lib/validation/schemas";
import { generateBracket } from "@/lib/services/stage.service";
import { getBracket } from "@/lib/services/match.service";

type Ctx = RouteContext<{ id: string }>;

// Visual bracket for the knockout stages.
export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.MATCH_VIEW);
  const { id } = await params;
  return ok(await getBracket(actor, id));
});

// Generate a single-elimination bracket from seeded participants.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.STAGE_MANAGE);
  const { id } = await params;
  const input = GenerateBracketSchema.parse(await readJson(req));
  return created(await generateBracket(id, input, actor));
});

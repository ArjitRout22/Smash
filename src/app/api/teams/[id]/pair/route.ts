import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ChangeTeamPairSchema } from "@/lib/validation/schemas";
import { changeTeamPair } from "@/lib/services/team.service";

type Ctx = RouteContext<{ id: string }>;

// Swap one player on a team (team id/fixtures unchanged).
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const { id } = await params;
  const input = ChangeTeamPairSchema.parse(await readJson(req));
  return ok(await changeTeamPair(actor, id, input));
});

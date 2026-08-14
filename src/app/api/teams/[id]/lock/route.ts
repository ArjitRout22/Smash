import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { TeamLockSchema } from "@/lib/validation/schemas";
import { setTeamLock } from "@/lib/services/team.service";

type Ctx = RouteContext<{ id: string }>;

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const { id } = await params;
  const { locked } = TeamLockSchema.parse(await readJson(req));
  return ok(await setTeamLock(actor, id, locked));
});

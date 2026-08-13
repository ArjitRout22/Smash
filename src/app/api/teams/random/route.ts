import { route, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { RandomTeamsSchema } from "@/lib/validation/schemas";
import { createRandomTeams } from "@/lib/services/team.service";

export const POST = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const { tournamentId } = RandomTeamsSchema.parse(await readJson(req));
  return created(await createRandomTeams(actor, tournamentId));
});

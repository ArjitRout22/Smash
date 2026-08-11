import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateTeamSchema } from "@/lib/validation/schemas";
import { listTeams, createTeam } from "@/lib/services/team.service";

export const GET = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_VIEW);
  const tournamentId = new URL(req.url).searchParams.get("tournamentId") ?? undefined;
  return ok(await listTeams(actor, { tournamentId }));
});

export const POST = route(async (req) => {
  const actor = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const input = CreateTeamSchema.parse(await readJson(req));
  return created(await createTeam(input, actor));
});

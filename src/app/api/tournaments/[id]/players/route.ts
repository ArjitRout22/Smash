import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AddTournamentPlayersSchema } from "@/lib/validation/schemas";
import {
  listTournamentPlayers,
  addTournamentPlayers,
} from "@/lib/services/tournament.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  const { id } = await params;
  return ok(await listTournamentPlayers(actor, id));
});

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  const { playerIds } = AddTournamentPlayersSchema.parse(await readJson(req));
  return created(await addTournamentPlayers(id, playerIds, actor));
});

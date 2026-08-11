import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { UpdateTournamentSchema } from "@/lib/validation/schemas";
import {
  getTournament,
  updateTournament,
  softDeleteTournament,
} from "@/lib/services/tournament.service";

type Ctx = RouteContext<{ id: string }>;

export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_VIEW);
  const { id } = await params;
  return ok(await getTournament(actor, id));
});

export const PUT = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  const input = UpdateTournamentSchema.parse(await readJson(req));
  return ok(await updateTournament(id, input, actor));
});

export const DELETE = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_DELETE);
  const { id } = await params;
  await softDeleteTournament(id, actor);
  return ok({ deleted: true });
});

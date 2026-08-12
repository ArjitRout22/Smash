import { z } from "zod";
import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listScorers, addScorer } from "@/lib/services/tournament.service";

type Ctx = RouteContext<{ id: string }>;
const AddBody = z.object({ playerId: z.string().uuid() });

// Owner: list the players nominated to help score this tournament.
export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  return ok(await listScorers(actor, id));
});

// Owner: nominate a player (who has an account) to also enter scores.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.TOURNAMENT_EDIT);
  const { id } = await params;
  const { playerId } = AddBody.parse(await readJson(req));
  return created(await addScorer(actor, id, playerId));
});

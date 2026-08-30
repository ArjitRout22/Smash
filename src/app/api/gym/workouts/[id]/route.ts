import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { deleteWorkout } from "@/lib/services/gym.service";

type Ctx = RouteContext<{ id: string }>;

// Delete one of your OWN workouts (no editing — delete + re-log to fix a mistake).
export const DELETE = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  await deleteWorkout(actor, id);
  return ok({ deleted: true });
});

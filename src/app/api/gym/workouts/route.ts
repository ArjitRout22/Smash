import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requireUser } from "@/lib/auth/authorize";
import { LogWorkoutSchema } from "@/lib/validation/schemas";
import { listMyWorkouts, logWorkout } from "@/lib/services/gym.service";

export const GET = route(async (req) => {
  const actor = await requireUser();
  const p = parsePagination(new URL(req.url).searchParams);
  const { items, total } = await listMyWorkouts(actor, p);
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

export const POST = route(async (req) => {
  const actor = await requireUser();
  const input = LogWorkoutSchema.parse(await readJson(req));
  return created(await logWorkout(actor, input));
});

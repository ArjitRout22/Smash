import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { requireUser } from "@/lib/auth/authorize";
import { getGymLeaderboard } from "@/lib/services/gym.service";

export const GET = route(async (req) => {
  const actor = await requireUser();
  const p = parsePagination(new URL(req.url).searchParams);
  const { items, total } = await getGymLeaderboard(actor, p);
  return ok(items, { meta: paginationMeta(total, p.page, p.pageSize) });
});

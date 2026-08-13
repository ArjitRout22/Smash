import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getPublicLiveMatches } from "@/lib/services/public.service";

// PUBLIC (no auth): live scores for a public tournament's in-progress matches.
// Returns [] for private/missing tournaments — never exposes non-public data.
export const GET = route<{ id: string }>(async (_req, { params }: RouteContext<{ id: string }>) => {
  const { id } = await params;
  return ok(await getPublicLiveMatches(id));
});

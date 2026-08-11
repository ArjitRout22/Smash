import { route, readJson } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { CreateCasualMatchSchema } from "@/lib/validation/schemas";
import { listMyCasualMatches, createCasualMatch } from "@/lib/services/casual-match.service";

// The current user's individual (casual) matches — as challenger or opponent.
export const GET = route(async (req) => {
  const actor = await requireUser();
  const url = new URL(req.url);
  return ok(
    await listMyCasualMatches(actor, {
      status: url.searchParams.get("status") ?? undefined,
    })
  );
});

// Challenge another player to an individual match.
export const POST = route(async (req) => {
  const actor = await requireUser();
  const input = CreateCasualMatchSchema.parse(await readJson(req));
  return created(await createCasualMatch(actor, input));
});

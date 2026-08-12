import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { GenerateFixturesSchema } from "@/lib/validation/schemas";
import { generateFixtures } from "@/lib/services/match.service";

type Ctx = RouteContext<{ id: string }>;

// Owner: bulk-generate round-robin / group fixtures for the tournament.
export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requirePermission(PERMISSIONS.STAGE_MANAGE);
  const { id } = await params;
  const input = GenerateFixturesSchema.parse(await readJson(req));
  return created(await generateFixtures(id, input, actor));
});

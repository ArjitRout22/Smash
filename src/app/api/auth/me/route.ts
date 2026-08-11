import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    playerId: user.playerId,
    permissions: user.permissions,
  });
});

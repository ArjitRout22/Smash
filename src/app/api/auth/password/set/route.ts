import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { setPassword } from "@/lib/auth/service";

const Body = z.object({
  password: z.string().min(8).max(200),
  // Required only when changing an existing password (enforced server-side).
  currentPassword: z.string().max(200).optional(),
});

// Logged-in user sets or changes their account password.
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = Body.parse(await readJson(req));
  await setPassword(user.id, input.password, input.currentPassword);
  return ok({ ok: true });
});

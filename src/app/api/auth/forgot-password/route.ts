import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requestPasswordReset } from "@/lib/auth/password-reset";

const Body = z.object({ email: z.string().trim().email().max(200) });

export const POST = route(async (req) => {
  const { email } = Body.parse(await readJson(req));
  await requestPasswordReset(email, clientContext(req));
  // Always the same response — never reveal whether the account exists.
  return ok({ message: "If an account exists for that email, a reset link has been sent." });
});

import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { resetPassword } from "@/lib/auth/password-reset";

const Body = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8).max(200),
});

export const POST = route(async (req) => {
  const { token, password } = Body.parse(await readJson(req));
  await resetPassword(token, password);
  return ok({ message: "Your password has been reset. You can now log in." });
});

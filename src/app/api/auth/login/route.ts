import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { login } from "@/lib/auth/service";
import { attachSessionCookie } from "@/lib/auth/session";

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const POST = route(async (req) => {
  const input = Body.parse(await readJson(req));
  const { token, expiresAt, user } = await login(input, clientContext(req));
  const res = ok({ user });
  attachSessionCookie(res, token, expiresAt);
  return res;
});

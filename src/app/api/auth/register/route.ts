import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { register } from "@/lib/auth/service";
import { attachSessionCookie } from "@/lib/auth/session";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(20).optional(),
  // Must tick the Terms box (which grants name/results marketing use) to sign up.
  acceptedTerms: z.boolean().refine((v) => v === true, "You must accept the Terms to sign up"),
});

export const POST = route(async (req) => {
  const input = Body.parse(await readJson(req));
  const { token, expiresAt, user } = await register(input, clientContext(req));
  const res = created({ user });
  attachSessionCookie(res, token, expiresAt);
  return res;
});

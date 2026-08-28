import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { authByPhone } from "@/lib/auth/service";
import { attachSessionCookie } from "@/lib/auth/session";

const Body = z.object({
  phone: z.string().trim().min(4).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  // Only needed when creating a new account (unknown phone).
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  acceptedTerms: z.boolean().optional(),
});

// Verify a phone code → log in (known phone) or create an account (new phone).
export const POST = route(async (req) => {
  const input = Body.parse(await readJson(req));
  const result = await authByPhone(input, clientContext(req));
  if ("needsProfile" in result) return ok({ needsProfile: true });
  const res = ok({ user: result.user });
  attachSessionCookie(res, result.token, result.expiresAt);
  return res;
});

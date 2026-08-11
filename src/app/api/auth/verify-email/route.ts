import { z } from "zod";
import { route, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { verifyEmail } from "@/lib/auth/email-verification";

const Body = z.object({ token: z.string().min(16).max(200) });

export const POST = route(async (req) => {
  const { token } = Body.parse(await readJson(req));
  await verifyEmail(token);
  return ok({ verified: true });
});

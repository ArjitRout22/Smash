import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { addVerifiedPhone } from "@/lib/auth/service";
import { maskPhone } from "@/lib/auth/phone";
import { phoneAuthEnabled } from "@/lib/config/features";
import { Errors } from "@/lib/errors";

const Body = z.object({
  phone: z.string().trim().min(4).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// Logged-in user links a verified phone to their account (send the code via
// /api/auth/otp/start first, then confirm it here).
export const POST = route(async (req) => {
  if (!phoneAuthEnabled()) throw Errors.notFound("Not found");
  const user = await requireUser();
  const input = Body.parse(await readJson(req));
  const { phone } = await addVerifiedPhone(user.id, input.phone, input.code, clientContext(req));
  return ok({ phone: maskPhone(phone) });
});

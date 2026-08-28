import { z } from "zod";
import { route, readJson, clientContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { startOtp } from "@/lib/auth/otp";

const Body = z.object({ phone: z.string().trim().min(4).max(20) });

// Send a one-time code to a phone number (for phone sign-in or linking).
export const POST = route(async (req) => {
  const input = Body.parse(await readJson(req));
  const { masked } = await startOtp(input.phone, clientContext(req));
  return ok({ sent: true, masked });
});

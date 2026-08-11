import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { rateLimiter } from "@/lib/ratelimit";
import { resendVerification } from "@/lib/auth/email-verification";

export const POST = route(async () => {
  const user = await requireUser();
  // Throttle resends per user.
  const guard = await rateLimiter.hit(`verify:resend:${user.id}`, 3, 900);
  if (guard.allowed && !user.emailVerified) {
    await resendVerification(user.id);
  }
  return ok({ message: "If your email is unverified, a new link has been sent." });
});

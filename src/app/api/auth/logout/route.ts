import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  clearSessionCookie,
  readSessionToken,
  revokeSession,
} from "@/lib/auth/session";
import { jwtVerify } from "jose";
import { getEnv } from "@/lib/config/env";

export const POST = route(async () => {
  const token = await readSessionToken();
  if (token) {
    // Best-effort server-side revocation of the session row.
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(getEnv().SESSION_SECRET),
        { algorithms: ["HS256"] }
      );
      if (payload.jti) await revokeSession(payload.jti);
    } catch {
      // token unparseable — just clear the cookie
    }
  }
  const res = ok({ loggedOut: true });
  clearSessionCookie(res);
  return res;
});

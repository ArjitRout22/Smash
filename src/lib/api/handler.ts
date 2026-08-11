import type { NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/response";

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

/**
 * Wrap a route handler so any thrown AppError/ZodError/Prisma error becomes a
 * standardized JSON response and unexpected errors are logged, not leaked.
 */
export function route<P extends Record<string, string> = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function clientContext(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  return { userAgent: req.headers.get("user-agent"), ip };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

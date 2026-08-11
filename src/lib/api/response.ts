import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, type ErrorCode } from "@/lib/errors";

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = { success: true; data: T; meta?: unknown };
export type ApiFailure = { success: false; error: ApiError };

export function ok<T>(data: T, init?: { status?: number; meta?: unknown }) {
  const body: ApiSuccess<T> = { success: true, data };
  if (init?.meta !== undefined) body.meta = init.meta;
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function created<T>(data: T, meta?: unknown) {
  return ok(data, { status: 201, meta });
}

export function fail(error: ApiError, status: number) {
  const body: ApiFailure = { success: false, error };
  return NextResponse.json(body, { status });
}

/**
 * Convert any thrown value into a safe, standardized API response.
 * Unknown errors are logged and reported as a generic 500 — no stack traces
 * or DB internals ever reach the client.
 */
export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    return fail(
      { code: err.code, message: err.message, details: err.details },
      err.status
    );
  }

  if (err instanceof ZodError) {
    return fail(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return fail(
        { code: "CONFLICT", message: "A record with these values already exists" },
        409
      );
    }
    if (err.code === "P2025") {
      return fail({ code: "NOT_FOUND", message: "Resource not found" }, 404);
    }
  }

  // Unknown — log server-side, hide details from the client.
  console.error("[unhandled-error]", err);
  return fail(
    { code: "INTERNAL_ERROR", message: "Something went wrong" },
    500
  );
}

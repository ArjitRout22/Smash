/**
 * Standardized application errors. Every error carries a stable machine code,
 * an HTTP status, and a safe user-facing message. Internal details are logged
 * server-side but never leaked to the client.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "INVALID_SCORE"
  | "INVALID_MATCH_CONFIG"
  | "CONCURRENCY_CONFLICT"
  | "INTERNAL_ERROR";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_STATE: 409,
  INVALID_SCORE: 422,
  INVALID_MATCH_CONFIG: 422,
  CONCURRENCY_CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; details?: unknown }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? DEFAULT_STATUS[code];
    this.details = options?.details;
  }
}

// Convenience constructors ---------------------------------------------------
export const Errors = {
  validation: (message = "Invalid input", details?: unknown) =>
    new AppError("VALIDATION_ERROR", message, { details }),
  unauthorized: (message = "Authentication required") =>
    new AppError("UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to do that") =>
    new AppError("FORBIDDEN", message),
  notFound: (entity = "Resource") =>
    new AppError("NOT_FOUND", `${entity} not found`),
  conflict: (message = "Resource already exists") =>
    new AppError("CONFLICT", message),
  rateLimited: (message = "Too many requests, please slow down") =>
    new AppError("RATE_LIMITED", message),
  invalidState: (message: string) => new AppError("INVALID_STATE", message),
  invalidScore: (message: string) => new AppError("INVALID_SCORE", message),
  invalidMatchConfig: (message: string) =>
    new AppError("INVALID_MATCH_CONFIG", message),
  concurrency: (
    message = "This record was modified by someone else. Please reload and try again."
  ) => new AppError("CONCURRENCY_CONFLICT", message),
};

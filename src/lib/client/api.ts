"use client";

/**
 * Typed browser API client. Wraps fetch, unwraps the standard { success, data }
 * envelope, and throws a structured ApiClientError the UI can branch on.
 */
export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type PageMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type Envelope<T> =
  | { success: true; data: T; meta?: PageMeta }
  | { success: false; error: { code: string; message: string; details?: unknown } };

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ data: T; meta?: PageMeta }> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // non-JSON response
  }

  if (!json) {
    throw new ApiClientError("NETWORK_ERROR", "Unexpected server response", res.status);
  }
  if (!json.success) {
    throw new ApiClientError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return { data: json.data, meta: json.meta };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path).then((r) => r.data),
  getWithMeta: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body).then((r) => r.data),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body).then((r) => r.data),
  del: <T>(path: string) => request<T>("DELETE", path).then((r) => r.data),
};

/** SWR fetcher that returns just the data payload. */
export const swrFetcher = <T>(path: string) => api.get<T>(path);
/** SWR fetcher that preserves pagination meta. */
export const swrFetcherWithMeta = <T>(path: string) => api.getWithMeta<T>(path);

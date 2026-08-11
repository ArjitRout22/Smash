/**
 * Rate limiting abstraction. The default implementation is an in-memory
 * sliding-window counter — fine for a single-process dev/small deployment.
 * For horizontally-scaled production, swap in a Redis-backed limiter behind
 * the same `RateLimiter` interface (no call-site changes required).
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window frees up
  retryAfterSeconds: number;
};

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, number[]>();

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const timestamps = (this.buckets.get(key) ?? []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const resetAt = oldest + windowMs;
      this.buckets.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, limit - timestamps.length),
      resetAt: now + windowMs,
      retryAfterSeconds: 0,
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

// Singleton across hot reloads.
const globalForRl = globalThis as unknown as { rateLimiter?: RateLimiter };
export const rateLimiter: RateLimiter =
  globalForRl.rateLimiter ?? new InMemoryRateLimiter();
if (process.env.NODE_ENV !== "production") globalForRl.rateLimiter = rateLimiter;

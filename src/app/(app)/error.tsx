"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";

/**
 * App error boundary. Most importantly: recovers from a `ChunkLoadError`, which
 * happens when the user navigates after a new deploy has replaced the JS chunks
 * their tab was holding — instead of a dead "error page", we reload once.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError =
    error?.name === "ChunkLoadError" || /Loading chunk|dynamically imported module|Failed to fetch/i.test(error?.message ?? "");

  useEffect(() => {
    if (isChunkError && typeof window !== "undefined") {
      // A newer version is live — reload to pick up the fresh assets.
      window.location.reload();
    }
  }, [isChunkError]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-[var(--border)] bg-surface p-8">
        <p className="text-lg font-semibold text-foreground">
          {isChunkError ? "Updating to the latest version…" : "Something went wrong"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {isChunkError
            ? "A new version was just released. Reloading…"
            : "An unexpected error occurred. You can try again."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <a href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

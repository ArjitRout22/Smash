"use client";

import { useState } from "react";
import { X, Download, Share } from "lucide-react";
import { useInstall } from "@/lib/client/useInstall";

const DISMISS_KEY = "smash-install-dismissed";

/**
 * Dismissible "install app" banner (Android Install button / iOS home-screen
 * hint). The permanent, non-dismissible version lives on the Profile page
 * (InstallCard); both share `useInstall`.
 */
export function InstallPrompt() {
  const { mode, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1"
  );

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (dismissed || (mode !== "ios" && mode !== "android")) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm">🏸</span>
        {mode === "ios" ? (
          <span className="text-muted">
            Install Smash: tap <Share className="inline h-4 w-4 -translate-y-0.5" aria-label="Share" /> then{" "}
            <b className="text-foreground">Add to Home Screen</b>.
          </span>
        ) : (
          <span className="text-muted">Install Smash for one-tap access from your home screen.</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {mode === "android" && (
          <button onClick={promptInstall} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-3.5 w-3.5" /> Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="rounded-md p-1.5 text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

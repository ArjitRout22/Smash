"use client";

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

// `beforeinstallprompt` isn't in the DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptState = { kind: "ios" } | { kind: "android"; event: BeforeInstallPromptEvent };
const DISMISS_KEY = "smash-install-dismissed";

/**
 * A dismissible "install app" banner.
 *  - Android/desktop Chrome: captures `beforeinstallprompt` → Install button.
 *  - iOS Safari (no prompt API): shows manual "Share → Add to Home Screen" steps.
 * Hidden if already installed (standalone) or previously dismissed.
 */
export function InstallPrompt() {
  const [state, setState] = useState<PromptState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone || localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua)) {
      // One-time environment read; deriving in render isn't possible after SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "ios" });
      return;
    }
    const onBIP = (e: Event) => {
      e.preventDefault();
      setState({ kind: "android", event: e as BeforeInstallPromptEvent });
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (state?.kind !== "android") return;
    await state.event.prompt();
    await state.event.userChoice;
    dismiss();
  }

  if (!state || dismissed) return null;
  const isIOS = state.kind === "ios";

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm">🏸</span>
        {isIOS ? (
          <span className="text-muted">
            Install Smash: tap <Share className="inline h-4 w-4 -translate-y-0.5" aria-label="Share" /> then{" "}
            <b className="text-foreground">Add to Home Screen</b>.
          </span>
        ) : (
          <span className="text-muted">Install Smash for one-tap access from your home screen.</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isIOS && (
          <button onClick={install} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
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

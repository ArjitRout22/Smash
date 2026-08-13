"use client";

import { useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useInstall } from "@/lib/client/useInstall";
import { IosInstallGuide } from "@/components/InstallGuide";

const DISMISS_KEY = "smash-install-dismissed";

/**
 * A polished, dismissible "install app" prompt that floats at the bottom of the
 * screen (so it never pushes dashboard content down). On iOS Safari the primary
 * action opens a step-by-step Add-to-Home-Screen guide (iOS has no programmatic
 * install); on Android it fires the native beforeinstallprompt. Hidden once the
 * app runs standalone or after the user dismisses it (remembered).
 * The permanent, non-dismissible entry lives on the Profile page (InstallCard).
 */
export function InstallPrompt() {
  const { mode, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1"
  );
  const [guideOpen, setGuideOpen] = useState(false);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // Only surface where an install path exists; never when already installed.
  if (dismissed || (mode !== "ios" && mode !== "android")) return null;

  const isIos = mode === "ios";

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[var(--border)] bg-surface p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg">🏸</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">
                {isIos ? "Install Smash on your iPhone" : "Install Smash"}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Get quick access to your tournaments, matches and player stats right from your Home Screen.
              </p>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="-m-1 shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={dismiss} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2">
              Install later
            </button>
            {isIos ? (
              <Button size="sm" onClick={() => setGuideOpen(true)}>Install Smash</Button>
            ) : (
              <Button size="sm" onClick={promptInstall}>
                <Download className="h-4 w-4" /> Install
              </Button>
            )}
          </div>
        </div>
      </div>

      <IosInstallGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}

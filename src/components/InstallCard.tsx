"use client";

import { Download, Check, Share } from "lucide-react";
import { Card, CardHeader, Button } from "@/components/ui/primitives";
import { useInstall } from "@/lib/client/useInstall";

/**
 * Permanent "Install the app" card (Profile page) — always visible, not
 * dismissible, adapts to the platform. Complements the transient InstallPrompt
 * banner; both share `useInstall`.
 */
export function InstallCard() {
  const { mode, promptInstall } = useInstall();

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Install the app" subtitle="Add Smash to your home screen for one-tap access and a full-screen app." />
      <div className="px-5 py-4 text-sm">
        {mode === "loading" && <p className="text-muted">Checking…</p>}
        {mode === "installed" && (
          <p className="inline-flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" /> Installed — you&apos;re using the app.
          </p>
        )}
        {mode === "android" && (
          <Button size="sm" onClick={promptInstall}>
            <Download className="h-4 w-4" /> Install app
          </Button>
        )}
        {mode === "ios" && (
          <p className="text-muted">
            On iPhone/iPad: tap the <Share className="inline h-4 w-4 -translate-y-0.5" aria-label="Share" /> Share button in
            Safari, then <b className="text-foreground">Add to Home Screen</b>.
          </p>
        )}
        {mode === "other" && (
          <p className="text-muted">
            Open your browser menu and choose <b className="text-foreground">Install app</b> (or{" "}
            <b className="text-foreground">Add to Home Screen</b>).
          </p>
        )}
      </div>
    </Card>
  );
}

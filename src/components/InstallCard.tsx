"use client";

import { useState } from "react";
import { Download, Check, Share } from "lucide-react";
import { Card, CardHeader, Button } from "@/components/ui/primitives";
import { useInstall } from "@/lib/client/useInstall";
import { IosInstallGuide } from "@/components/InstallGuide";

/**
 * Permanent "Install the app" card (Profile page) — always visible, not
 * dismissible, adapts to the platform. Complements the transient InstallPrompt
 * banner; both share `useInstall`. On iOS it opens the step-by-step guide.
 */
export function InstallCard() {
  const { mode, promptInstall } = useInstall();
  const [guideOpen, setGuideOpen] = useState(false);

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
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted">Add Smash to your Home Screen from Safari&apos;s Share menu — it only takes a moment.</p>
            <Button size="sm" onClick={() => setGuideOpen(true)}>
              <Share className="h-4 w-4" /> Show me how
            </Button>
          </div>
        )}
        {mode === "other" && (
          <p className="text-muted">
            Open your browser menu and choose <b className="text-foreground">Install app</b> (or{" "}
            <b className="text-foreground">Add to Home Screen</b>).
          </p>
        )}
      </div>
      <IosInstallGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </Card>
  );
}

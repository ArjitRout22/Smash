"use client";

import { useEffect, useState } from "react";

// `beforeinstallprompt` isn't in the DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "loading" | "installed" | "ios" | "android" | "other";

/**
 * Shared PWA-install state for the banner + the Profile card.
 *  - installed: already running standalone
 *  - ios: iOS Safari (manual "Share → Add to Home Screen")
 *  - android: Chrome fired `beforeinstallprompt` → `promptInstall()` available
 *  - other: a browser we can't trigger install on (use its menu)
 */
export function useInstall() {
  const [mode, setMode] = useState<InstallMode>("loading");
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    const ua = navigator.userAgent;
    const iOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    const initial: InstallMode = standalone ? "installed" : iOS ? "ios" : "other";
    // One-time environment read; can't derive during render after SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initial);
    if (initial !== "other") return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function promptInstall() {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setMode("installed");
    return choice.outcome === "accepted";
  }

  return { mode, promptInstall };
}

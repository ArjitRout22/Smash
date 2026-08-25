"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const APK_URL = "/downloads/smash.apk";
const TWA_PACKAGE = "app.smashhero.www.twa";
const DISMISS_KEY = "smash.androidApkDismissed";

interface RelatedApp {
  platform?: string;
  id?: string;
  url?: string;
}

/**
 * Public-page prompt inviting Android *web* visitors to install the native app
 * (the TWA APK served from /downloads). Shows only when it's useful:
 *  - hidden off Android (iOS has its own Add-to-Home-Screen flow)
 *  - hidden when already running standalone (opened *through* the installed app)
 *  - hidden (best-effort) when getInstalledRelatedApps reports the TWA is installed
 *    — only fires once the app is listed in the manifest's related_applications
 *    (e.g. after a Play listing); until then it returns [] and we fall back to the
 *    standalone check above, which is the dependable "installed" signal
 *  - hidden once the visitor dismisses it (persisted in localStorage)
 * Renders nothing until the environment is resolved, to avoid an SSR/hydration flash.
 */
export function AndroidAppBanner({ className = "" }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const nav = window.navigator as Navigator & {
      standalone?: boolean;
      getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
    };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    const isAndroid = /android/i.test(navigator.userAgent);
    const dismissed = (() => {
      try {
        return localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    })();

    if (!isAndroid || standalone || dismissed) return;

    // Show optimistically as soon as the environment qualifies — a synchronous
    // state update in the effect body reliably renders (an async-only path can be
    // dropped during hydration). Then, as progressive enhancement, RETRACT it if
    // Chrome can confirm the TWA is already installed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
    if (typeof nav.getInstalledRelatedApps === "function") {
      nav
        .getInstalledRelatedApps()
        .then((apps) => {
          if (!cancelled && apps.some((a) => a.id === TWA_PACKAGE)) setShow(false);
        })
        .catch(() => {
          /* unsupported / denied — keep showing */
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — fine, it just won't persist */
    }
  }

  if (!show) return null;

  return (
    <div className={`relative flex items-center gap-3 rounded-xl border border-[var(--border)] bg-surface p-4 pr-10 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-lg">
        🏸
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Get the Smash Android app</p>
        <p className="text-xs text-muted">Install the app for a faster, full-screen experience.</p>
      </div>
      <a
        href={APK_URL}
        download
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Download className="h-4 w-4" /> Install
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Slim top-of-page progress bar shown during client navigations, so page
 * transitions always have a visible "loading" cue (the App Router has no built-in
 * router events). It starts when a same-tab internal link / back-forward
 * navigation begins and completes when the pathname actually changes. Pairs with
 * the full-screen `loading.tsx` fallback for slow server segment loads.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (hide.current) { clearTimeout(hide.current); hide.current = null; }
    setVisible(true);
    setWidth(8);
    if (trickle.current) clearInterval(trickle.current);
    trickle.current = setInterval(() => {
      // Ease toward 90% and hold there until the navigation completes.
      setWidth((w) => (w < 90 ? w + Math.max(0.5, (90 - w) * 0.08) : w));
    }, 200);
  }

  function finish() {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null; }
    setWidth(100);
    hide.current = setTimeout(() => { setVisible(false); setWidth(0); }, 250);
  }

  // Kick off the bar as soon as a same-tab internal navigation is initiated.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || a.target === "_blank" || href.startsWith("#")) return;
      if (href.startsWith("http") && !href.startsWith(window.location.origin)) return; // external
      const url = new URL(a.href, window.location.href);
      if (url.pathname === window.location.pathname) return; // same page (or query-only)
      start();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      if (trickle.current) clearInterval(trickle.current);
      if (hide.current) clearTimeout(hide.current);
    };
  }, []);

  // Complete when the pathname actually changes (skip the initial mount).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    finish();
  }, [pathname]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${width}%`, boxShadow: "0 0 8px var(--primary)" }}
      />
    </div>
  );
}

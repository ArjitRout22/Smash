"use client";

import { useEffect } from "react";

/**
 * Fades out and removes the first-paint splash (`#app-splash`, rendered inline in
 * the root layout) once React has hydrated — i.e. the app is ready to show. The
 * splash itself is plain HTML + inline critical CSS, so it paints on the very
 * first frame (no white screen on a cold load / PWA launch) without waiting for
 * any JS. A safety timeout in the layout also clears it if hydration is slow.
 */
export function SplashHider() {
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el) return;
    const raf = requestAnimationFrame(() => el.classList.add("app-splash--hide"));
    const t = setTimeout(() => el.remove(), 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);
  return null;
}

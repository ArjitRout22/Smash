import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SplashHider } from "@/components/SplashHider";

// First-paint splash: plain HTML + inline critical CSS so the browser shows the
// branded loader on the very first frame (cold load / PWA launch) instead of a
// white screen. Removed by <SplashHider/> as soon as React hydrates.
const SPLASH_CSS = `
#app-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:16px;background:#f6f7f9;
transition:opacity .35s ease}
#app-splash.app-splash--hide{opacity:0;pointer-events:none}
#app-splash .as-mark{display:flex;align-items:center;justify-content:center;width:64px;
height:64px;border-radius:16px;background:#059669;font-size:34px;line-height:1}
#app-splash .as-name{font-family:system-ui,-apple-system,sans-serif;font-weight:700;
font-size:20px;color:#0f172a}
#app-splash .as-spin{width:26px;height:26px;border-radius:9999px;
border:3px solid rgba(5,150,105,.25);border-top-color:#059669;
animation:as-spin .8s linear infinite}
@keyframes as-spin{to{transform:rotate(360deg)}}
@media (prefers-color-scheme:dark){#app-splash{background:#0b1120}
#app-splash .as-name{color:#f8fafc}}
`;

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";
const DESCRIPTION =
  "Run badminton tournaments and casual matches: players, teams, brackets, live scoring and a global leaderboard.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Smash — Badminton Tournaments & Matches", template: "%s · Smash" },
  description: DESCRIPTION,
  applicationName: "Smash",
  appleWebApp: { capable: true, title: "Smash", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Smash — Badminton Tournaments & Matches",
    description: DESCRIPTION,
    url: APP_URL,
    siteName: "Smash",
    type: "website",
  },
  twitter: { card: "summary", title: "Smash", description: DESCRIPTION },
};

// Explicit viewport; note we do NOT set maximumScale so pinch-zoom stays on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        {/* Painted immediately from the server HTML; SplashHider fades it out on hydration. */}
        <div id="app-splash" aria-hidden="true">
          <div className="as-mark">🏸</div>
          <div className="as-name">Smash</div>
          <div className="as-spin" />
        </div>
        {/* Safety net: clear the splash even if hydration is slow/blocked. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "setTimeout(function(){var e=document.getElementById('app-splash');if(e)e.classList.add('app-splash--hide')},10000)",
          }}
        />
        <ServiceWorker />
        <ToastProvider>{children}</ToastProvider>
        <SplashHider />
      </body>
    </html>
  );
}

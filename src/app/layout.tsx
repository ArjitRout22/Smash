import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";
const DESCRIPTION =
  "Run badminton tournaments and casual matches: players, teams, brackets, live scoring and a global leaderboard.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Smash — Badminton Tournaments & Matches", template: "%s · Smash" },
  description: DESCRIPTION,
  applicationName: "Smash",
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

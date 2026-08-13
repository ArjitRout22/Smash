import type { MetadataRoute } from "next";

// Web app manifest → makes Smash installable (Add to Home Screen) and is the
// prerequisite for Web Push (incl. iOS, once installed as a PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smash — Badminton Tournaments & Matches",
    short_name: "Smash",
    description: "Run badminton tournaments and casual matches with a global leaderboard.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1120",
    theme_color: "#059669",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

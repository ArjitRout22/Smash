import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Only the public, no-login surface is indexable. Everything behind auth
      // (dashboards, management, directories, APIs) is disallowed.
      allow: ["/explore", "/t/", "/player/"],
      disallow: [
        "/api/",
        "/dashboard",
        "/tournaments",
        "/discover",
        "/players",
        "/teams",
        "/challenges",
        "/profile",
        "/admin",
        "/login",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}

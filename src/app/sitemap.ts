import type { MetadataRoute } from "next";
import { listPublicTournaments, listPublicPlayerIds } from "@/lib/services/public.service";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

// Regenerate at most hourly — the public surface (tournaments/players) changes
// slowly and this keeps the sitemap cheap to serve.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tournaments, players] = await Promise.all([
    listPublicTournaments(1000),
    listPublicPlayerIds(1000),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/explore`, changeFrequency: "daily", priority: 0.8 },
  ];

  const tournamentEntries: MetadataRoute.Sitemap = tournaments.map((t) => ({
    url: `${APP_URL}${t.href}`,
    lastModified: t.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const playerEntries: MetadataRoute.Sitemap = players.map((p) => ({
    url: `${APP_URL}/player/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticEntries, ...tournamentEntries, ...playerEntries];
}

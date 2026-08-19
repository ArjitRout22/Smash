import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { getPublicTournamentView } from "@/lib/services/public.service";
import { ShareButton } from "@/components/ShareButton";
import { LiveNow } from "@/components/LiveNow";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function statusClass(status: string) {
  const map: Record<string, string> = {
    upcoming: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    ongoing: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    completed: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return map[status] ?? "bg-slate-500/15 text-slate-500";
}
function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(d);
}
function mapUrl(location: string | null, lat: number | null, lng: number | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getPublicTournamentView(id);
  if (!t) return { title: "Tournament not found" };
  const desc = `${titleCase(t.format)} · ${t.players.length} players${t.location ? ` · ${t.location}` : ""} — follow live standings and results on Smash.`;
  const canonical = `${APP_URL}/t/${t.slug ?? t.id}`;
  // og:image / twitter:image are supplied by the colocated opengraph-image.tsx /
  // twitter-image.tsx; here we just opt into the large-image Twitter card.
  return {
    title: t.name, // root layout template appends " · Smash"
    description: desc,
    alternates: { canonical },
    openGraph: { title: `${t.name} · Smash`, description: desc, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title: `${t.name} · Smash`, description: desc },
  };
}

export default async function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getPublicTournamentView(id);
  if (!t) notFound();
  // Canonicalise: if reached by raw uuid (or a stale slug) and a slug exists,
  // 308-redirect to the readable /t/<slug> URL so search engines index one path.
  if (t.slug && id !== t.slug) permanentRedirect(`/t/${t.slug}`);

  const canonicalPath = `/t/${t.slug ?? t.id}`;
  const url = `${APP_URL}${canonicalPath}`;
  const map = mapUrl(t.location, t.locationLat, t.locationLng);
  const joinHref = `/login?next=${encodeURIComponent(`/discover/${t.id}`)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: t.name,
    sport: "Badminton",
    url,
    eventStatus:
      t.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    ...(t.startDate ? { startDate: t.startDate.toISOString() } : {}),
    ...(t.endDate ? { endDate: t.endDate.toISOString() } : {}),
    ...(t.location ? { location: { "@type": "Place", name: t.location } } : {}),
    ...(t.organizerName ? { organizer: { "@type": "Organization", name: t.organizerName } } : {}),
    description: t.description ?? undefined,
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Public top bar */}
      <header className="border-b border-[var(--border)] bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm">🏸</span> Smash
          </Link>
          <Link href={joinHref} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{t.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(t.status)}`}>{titleCase(t.status)}</span>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{titleCase(t.format)}</span>
              <span>· {t.players.length} players</span>
              {t.organizerName && <span>· by {t.organizerName}</span>}
              {fmtDate(t.startDate) && <span>· {fmtDate(t.startDate)}</span>}
            </p>
            {map && (
              <a href={map} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <MapPin className="h-4 w-4" /> {t.location}
              </a>
            )}
          </div>
          <ShareButton url={url} title={`${t.name} · Smash`} text={`Follow "${t.name}" on Smash.`} label="Share" />
        </div>

        {t.description && <p className="mt-4 max-w-prose text-sm text-muted">{t.description}</p>}

        {/* Join CTA */}
        <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">Playing in this one? Join it, track your matches, and climb the leaderboard.</p>
          <Link href={joinHref} className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in to join
          </Link>
        </div>

        <LiveNow tournamentId={t.id} />

        {/* Standings */}
        {t.standings.length > 0 && (
          <Section title="Standings">
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-muted">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Player / Team</th>
                    <th className="px-4 py-2 text-right font-medium">W</th>
                    <th className="px-4 py-2 text-right font-medium">L</th>
                    <th className="px-4 py-2 text-right font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {t.standings.map((s, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 text-muted">{s.position ?? i + 1}</td>
                      <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.wins}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.losses}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Recent results */}
        {t.matches.length > 0 && (
          <Section title="Recent results">
            <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {t.matches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className={m.winnerSide === "A" ? "font-semibold text-foreground" : "text-muted"}>{m.sides[0].label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {m.sides[0].gamesWon}–{m.sides[1].gamesWon}
                    {m.games.length > 0 && <span className="ml-2 hidden sm:inline">({m.games.map((g) => `${g.scoreA}-${g.scoreB}`).join(", ")})</span>}
                  </span>
                  <span className={`text-right ${m.winnerSide === "B" ? "font-semibold text-foreground" : "text-muted"}`}>{m.sides[1].label}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Players */}
        {t.players.length > 0 && (
          <Section title={`Players (${t.players.length})`}>
            <div className="flex flex-wrap gap-2">
              {t.players.map((p) => (
                <span key={p.id} className="rounded-full border border-[var(--border)] bg-surface px-3 py-1 text-sm">{p.displayName}</span>
              ))}
            </div>
          </Section>
        )}

        <footer className="mt-10 border-t border-[var(--border)] pt-6 text-center text-sm text-muted">
          Powered by <Link href="/" className="font-medium text-primary hover:underline">Smash</Link> — run your own badminton tournaments & matches.
        </footer>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { listPublicTournaments } from "@/lib/services/public.service";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

// Public listings change as tournaments are created/scored — revalidate hourly
// so the page stays cacheable/SEO-friendly without going stale for long.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Explore badminton tournaments",
  description:
    "Browse public badminton tournaments on Smash — live standings, results, and player rankings. Find one to follow or run your own.",
  alternates: { canonical: `${APP_URL}/explore` },
  openGraph: {
    title: "Explore badminton tournaments · Smash",
    description: "Browse public badminton tournaments on Smash — live standings, results, and rankings.",
    url: `${APP_URL}/explore`,
    type: "website",
  },
};

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

export default async function ExplorePage() {
  const tournaments = await listPublicTournaments();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Public badminton tournaments on Smash",
    itemListElement: tournaments.slice(0, 50).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${APP_URL}${t.href}`,
      name: t.name,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-[var(--border)] bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/explore" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm">🏸</span> Smash
          </Link>
          <Link href="/login" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Explore tournaments</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Public badminton tournaments on Smash. Tap any to follow its live standings and results — or{" "}
          <Link href="/login" className="text-primary hover:underline">sign in</Link> to run your own.
        </p>

        {tournaments.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-surface p-8 text-center text-sm text-muted">
            No public tournaments yet. Check back soon.
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.href}
                  className="block h-full rounded-xl border border-[var(--border)] bg-surface p-4 transition hover:border-[var(--primary)] hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 font-semibold text-foreground">{t.name}</h2>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(t.status)}`}>
                      {titleCase(t.status)}
                    </span>
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{titleCase(t.format)}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t.playerCount}</span>
                    {fmtDate(t.startDate) && <span>· {fmtDate(t.startDate)}</span>}
                  </p>
                  {t.location && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                      <MapPin className="h-3.5 w-3.5" /> {t.location}
                    </p>
                  )}
                  {t.organizerName && <p className="mt-1 text-xs text-muted">by {t.organizerName}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-10 border-t border-[var(--border)] pt-6 text-center text-sm text-muted">
          Powered by <Link href="/login" className="font-medium text-primary hover:underline">Smash</Link> — run your own badminton tournaments &amp; matches.
        </footer>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Users, Zap, Share2, BarChart3, ShieldCheck } from "lucide-react";
import { getLandingData } from "@/lib/services/public.service";
import { AndroidAppBanner } from "@/components/AndroidAppBanner";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

// Public marketing home — cache (ISR); community numbers refresh hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Smash — we make grassroots badminton heroes" },
  description:
    "Smash runs your whole badminton event — fixtures, live scoring, group stages, knockout brackets, and a public leaderboard. From a Sunday club game to a 100-player championship. Free to start.",
  alternates: { canonical: APP_URL },
  openGraph: {
    title: "Smash — we make grassroots badminton heroes",
    description: "Run badminton tournaments, score live, and climb the rankings. Free to start.",
    url: APP_URL,
    type: "website",
  },
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const FEATURES = [
  { icon: Trophy, title: "Any format, in minutes", body: "Round-robin, knockout brackets, or a full group stage where the top of each group auto-advances to the knockout — seeded, with byes handled for you." },
  { icon: Zap, title: "Live scoring", body: "Point-by-point scoreboards with a public “Live now” page so everyone can follow along in real time." },
  { icon: BarChart3, title: "Rankings & stats", body: "Automatic leaderboards, win/loss records, head-to-head, and a shareable SmashHero rating for every player." },
  { icon: Share2, title: "Share anything", body: "Public tournament and player pages with rich share cards — post a link to WhatsApp and it just works." },
  { icon: Users, title: "Bring your club", body: "Invite players by email, build teams, and let participants follow their matches without any setup." },
  { icon: ShieldCheck, title: "Yours, private by default", body: "Each organizer runs their own space. Make a tournament public only when you want the world to see it." },
];

export default async function LandingPage() {
  const { stats, topPlayers, tournaments } = await getLandingData().catch(() => ({
    stats: { tournaments: 0, players: 0, matchesPlayed: 0 },
    topPlayers: [] as Awaited<ReturnType<typeof getLandingData>>["topPlayers"],
    tournaments: [] as Awaited<ReturnType<typeof getLandingData>>["tournaments"],
  }));

  // Kept static/ISR (no per-request cookie read) so the marketing home is fast
  // and cacheable. Signed-in users still reach their app via "Sign in" → the
  // login page short-circuits to the dashboard when a session already exists.
  const primaryCta = { href: "/login", label: "Get started — it’s free" };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--border)] bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm">🏸</span> Smash
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/explore" className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2">
              Explore
            </Link>
            <Link href="/login" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-5xl px-4">
          <AndroidAppBanner className="mt-4" />
        </div>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-surface px-3 py-1 text-xs font-medium text-muted">
            🏸 Grassroots badminton, organized
          </div>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
            We make grassroots <span className="text-primary">badminton heroes.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            From a Sunday club game to a 100-player championship, Smash runs the whole event —
            fixtures, live scoring, group stages, knockout brackets, and a public leaderboard —
            so every rally counts and every player gets their moment. Free to start.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={primaryCta.href} className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:opacity-90">
              {primaryCta.label}
            </Link>
            <Link href="/explore" className="rounded-xl border border-[var(--border)] bg-surface px-6 py-3 text-base font-semibold text-foreground hover:bg-surface-2">
              Explore tournaments
            </Link>
          </div>

          {/* Community stats */}
          {(stats.tournaments > 0 || stats.players > 0) && (
            <div className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-2.5 sm:gap-4">
              {[
                { label: "Tournaments", value: stats.tournaments },
                { label: "Players", value: stats.players },
                { label: "Matches played", value: stats.matchesPlayed },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-surface p-3 sm:p-4">
                  <div className="text-2xl font-bold tabular-nums text-foreground">{s.value}</div>
                  {/* Shrink + drop letter-spacing on mobile so the longest single-word
                      label ("TOURNAMENTS") fits inside the card instead of spilling out. */}
                  <div className="mt-0.5 text-[10px] uppercase leading-tight tracking-normal text-muted sm:text-xs sm:tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Features */}
        <section className="border-y border-[var(--border)] bg-surface/50">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">Everything you need to run the game</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-[var(--border)] bg-surface p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof: top players + featured tournaments */}
        {(topPlayers.length > 0 || tournaments.length > 0) && (
          <section className="mx-auto max-w-5xl px-4 py-16">
            <div className="grid gap-8 lg:grid-cols-2">
              {topPlayers.length > 0 && (
                <div>
                  <h2 className="mb-4 text-lg font-bold text-foreground">Top players right now</h2>
                  <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-surface">
                    {topPlayers.map((p, i) => (
                      <li key={p.id}>
                        <Link href={`/player/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="w-5 text-center text-sm font-semibold text-muted">{i + 1}</span>
                            <span className="truncate font-medium text-foreground">{p.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-sm text-muted">{p.points} pts · {p.wins}W</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {tournaments.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-foreground">Public tournaments</h2>
                    <Link href="/explore" className="text-sm font-medium text-primary hover:underline">Explore all →</Link>
                  </div>
                  <ul className="space-y-3">
                    {tournaments.slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <Link href={t.href} className="block rounded-2xl border border-[var(--border)] bg-surface p-4 hover:border-[var(--primary)] hover:bg-surface-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-semibold text-foreground">{t.name}</span>
                            <span className="shrink-0 text-xs text-muted">{titleCase(t.status)}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{titleCase(t.format)} · {t.playerCount} players{t.location ? ` · ${t.location}` : ""}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="border-t border-[var(--border)] bg-surface/50">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Turn your club into champions</h2>
            <p className="mt-3 text-muted">Every big player started at a local court. Set up your first tournament in a couple of minutes — no credit card, no setup — and give your players a stage. Free to start.</p>
            <div className="mt-6 flex justify-center">
              <Link href={primaryCta.href} className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:opacity-90">
                {primaryCta.label}
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-muted">
          <div className="flex items-center justify-center gap-4">
            <Link href="/explore" className="hover:text-foreground">Explore</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
          <p className="mt-3">© {new Date().getUTCFullYear()} Smash — run your own badminton tournaments &amp; matches.</p>
        </footer>
      </main>
    </div>
  );
}

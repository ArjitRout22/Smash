import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPlayerProfile } from "@/lib/services/public.service";
import { ShareButton } from "@/components/ShareButton";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPublicPlayerProfile(id);
  if (!p) return { title: "Player not found" };
  const desc = `SmashHero Rating ${p.rating} · ${p.wins} wins · ${p.matchesPlayed} matches. Follow ${p.displayName} on Smash.`;
  return {
    title: `${p.displayName} · SmashHero`,
    description: desc,
    openGraph: { title: `${p.displayName} · SmashHero`, description: desc, url: `${APP_URL}/player/${id}`, type: "profile" },
    twitter: { card: "summary_large_image", title: `${p.displayName} · SmashHero`, description: desc },
  };
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-surface p-4">
      <div className={`text-2xl font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

export default async function PublicPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPublicPlayerProfile(id);
  if (!p) notFound();

  const url = `${APP_URL}/player/${id}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--border)] bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm">🏸</span> Smash
          </Link>
          <Link href="/login" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Identity + rating */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground">{p.displayName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
              {p.city && <span>{p.city}</span>}
              {p.rank != null && <span>· Global rank #{p.rank}</span>}
              {p.titles > 0 && <span>· 🏆 {p.titles} title{p.titles === 1 ? "" : "s"}</span>}
            </p>
          </div>
          <ShareButton url={url} title={`${p.displayName} · SmashHero`} text={`Check out ${p.displayName} on Smash — SmashHero Rating ${p.rating}.`} label="Share profile" />
        </div>

        {/* Hero rating */}
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)]/10 to-transparent p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">SmashHero Rating</div>
          <div className="mt-1 text-5xl font-extrabold tabular-nums text-foreground">{p.rating}</div>
          <div className="mt-1 text-sm text-muted">{p.wins} wins · {p.matchesPlayed} matches{p.winStreak >= 2 ? ` · 🔥 ${p.winStreak}-win streak` : ""}</div>
        </div>

        {/* Stat grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tournaments" value={p.tournamentsPlayed} />
          <Stat label="Matches" value={p.matchesPlayed} />
          <Stat label="Wins" value={p.wins} accent />
          <Stat label="Losses" value={p.losses} />
        </div>

        {/* Recent results */}
        <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent results</h2>
        {p.recentResults.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-muted">
            No public results yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            {p.recentResults.map((m) => (
              <div key={m.matchId} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">vs {m.opponent}</p>
                  <p className="truncate text-xs text-muted">{m.tournamentName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-sm text-muted">{m.score}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.won ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                    {m.won ? "Won" : "Lost"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tournament history */}
        {p.tournamentHistory.length > 0 && (
          <>
            <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Tournaments</h2>
            <div className="flex flex-wrap gap-2">
              {p.tournamentHistory.map((t) => (
                <span key={t.id} className="rounded-full border border-[var(--border)] bg-surface px-3 py-1 text-sm text-foreground">
                  {t.name} <span className="text-muted">· {t.matches}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {/* CTA */}
        <div className="mt-8 flex flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">Want a profile like this? Play tournaments and track your matches on Smash.</p>
          <Link href="/login" className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Get started
          </Link>
        </div>
      </main>
    </div>
  );
}

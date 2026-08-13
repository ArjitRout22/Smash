"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/client/api";

type Live = { id: string; a: number; b: number; sideA: string; sideB: string };

/**
 * Spectator "Live now" strip on the public tournament page — polls the public
 * live endpoint every few seconds so friends can watch scores update without a
 * login or a manual refresh. Renders nothing when no match is in progress.
 */
export function LiveNow({ tournamentId }: { tournamentId: string }) {
  const { data } = useSWR<Live[]>(
    `/api/public/tournaments/${tournamentId}/live`,
    swrFetcher,
    { refreshInterval: 4000 }
  );
  const live = data ?? [];
  if (live.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live now
      </h2>
      <div className="space-y-2">
        {live.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-surface px-4 py-3">
            <span className="flex-1 truncate text-right font-medium text-foreground">{m.sideA}</span>
            <span className="shrink-0 rounded-lg bg-surface-2 px-3 py-1 font-mono text-lg font-bold tabular-nums">{m.a} – {m.b}</span>
            <span className="flex-1 truncate font-medium text-foreground">{m.sideB}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

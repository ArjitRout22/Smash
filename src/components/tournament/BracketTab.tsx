"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/client/api";
import { Badge, statusColor } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import type { BracketRound } from "./types";

export function BracketTab({ tournamentId }: { tournamentId: string }) {
  const { data, error, isLoading, mutate } = useSWR<BracketRound[]>(
    `/api/tournaments/${tournamentId}/bracket`,
    swrFetcher
  );

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No bracket yet" message="Use “Generate bracket” above to build a knockout draw — it appears here." />;

  const roundName = (round: number, total: number) => {
    const fromFinal = total - round;
    return ["Final", "Semifinals", "Quarterfinals", "Round of 16", "Round of 32"][fromFinal] ?? `Round ${round}`;
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6" style={{ minWidth: data.length * 240 }}>
        {data.map((r) => (
          <div key={r.round} className="flex w-56 shrink-0 flex-col">
            <h3 className="mb-3 text-sm font-semibold text-muted">{roundName(r.round, data.length)}</h3>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {r.matches.map((m) => (
                <div key={m.id} className="rounded-lg border border-[var(--border)] bg-surface">
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted">Match {m.slot + 1}</span>
                    <Badge color={statusColor(m.status)}>{m.status === "completed" ? "done" : m.status}</Badge>
                  </div>
                  <BracketSide side={m.sideA} />
                  <div className="border-t border-[var(--border)]" />
                  <BracketSide side={m.sideB} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketSide({ side }: { side: BracketRound["matches"][number]["sideA"] }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 text-sm ${side?.isWinner ? "font-bold" : ""}`}>
      <span className="truncate">{side?.label ?? "TBD"}</span>
      <span className="ml-2 tabular-nums text-muted">{side?.score ?? ""}</span>
    </div>
  );
}

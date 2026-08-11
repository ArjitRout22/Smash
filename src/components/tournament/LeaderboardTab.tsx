"use client";

import Link from "next/link";
import useSWR from "swr";
import { swrFetcher } from "@/lib/client/api";
import { Card } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { titleCase } from "@/lib/client/format";
import type { LeaderboardRow } from "./types";

export function LeaderboardTab({ tournamentId }: { tournamentId: string }) {
  const { data, error, isLoading, mutate } = useSWR<LeaderboardRow[]>(
    `/api/tournaments/${tournamentId}/leaderboard`,
    swrFetcher
  );

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No standings yet" message="Standings update automatically as match results come in." />;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player / Team</th>
              <th className="px-4 py-3 text-center">P</th>
              <th className="px-4 py-3 text-center">W</th>
              <th className="px-4 py-3 text-center">L</th>
              <th className="px-4 py-3 text-center">Pts</th>
              <th className="px-4 py-3">Stage reached</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.entity?.id ?? i} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-semibold text-muted">{row.rank ?? i + 1}</td>
                <td className="px-4 py-3 font-medium">
                  {row.entity?.type === "player" ? (
                    <Link href={`/players/${row.entity.id}`} className="hover:underline">{row.entity.name}</Link>
                  ) : (
                    row.entity?.name ?? "—"
                  )}
                </td>
                <td className="px-4 py-3 text-center">{row.matchesPlayed}</td>
                <td className="px-4 py-3 text-center text-[var(--success)]">{row.wins}</td>
                <td className="px-4 py-3 text-center text-[var(--danger)]">{row.losses}</td>
                <td className="px-4 py-3 text-center font-bold">{row.points}</td>
                <td className="px-4 py-3 text-muted">{row.stageReached ? titleCase(row.stageReached) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

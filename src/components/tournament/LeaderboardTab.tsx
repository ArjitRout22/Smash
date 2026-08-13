"use client";

import Link from "next/link";
import useSWR from "swr";
import { swrFetcher } from "@/lib/client/api";
import { Card, CardHeader } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { resolvePointsConfig, describePointsSystem } from "@/lib/engines/points";
import { titleCase } from "@/lib/client/format";
import type { LeaderboardRow } from "./types";

export function LeaderboardTab({ tournamentId, pointsConfig }: { tournamentId: string; pointsConfig?: unknown }) {
  const { data, error, isLoading, mutate } = useSWR<LeaderboardRow[]>(
    `/api/tournaments/${tournamentId}/leaderboard`,
    swrFetcher
  );

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No standings yet" message="Standings update automatically as match results come in." />;

  const scoringRule = describePointsSystem(resolvePointsConfig(pointsConfig ?? undefined));

  // If participants were assigned groups (via Generate fixtures → Groups), show
  // a separate standings table per group; otherwise one combined table.
  const groups = Array.from(new Set(data.map((r) => r.group).filter((g): g is string => Boolean(g)))).sort();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Scoring: {scoringRule}</p>
      {groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <StandingsTable key={g} title={`Group ${g}`} rows={data.filter((r) => r.group === g)} />
          ))}
          {data.some((r) => !r.group) && (
            <StandingsTable title="Ungrouped" rows={data.filter((r) => !r.group)} />
          )}
        </div>
      ) : (
        <StandingsTable rows={data} />
      )}
    </div>
  );
}

function StandingsTable({ title, rows }: { title?: string; rows: LeaderboardRow[] }) {
  return (
    <Card className="overflow-hidden">
      {title && <CardHeader title={title} />}
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
            {rows.map((row, i) => (
              <tr key={row.entity?.id ?? i} className="border-b border-[var(--border)] last:border-0">
                {/* Rank within THIS table (per-group when grouped). */}
                <td className="px-4 py-3 font-semibold text-muted">{i + 1}</td>
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

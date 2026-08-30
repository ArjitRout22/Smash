"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Trophy } from "lucide-react";
import { swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Card, Input, Select, Avatar } from "@/components/ui/primitives";
import { pct } from "@/lib/client/format";

type Row = {
  rank: number | null;
  playerId: string;
  name: string;
  fullName: string;
  city?: string;
  photoUrl?: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  points: number;
  tournaments: number;
  titles: number;
};

type Meta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const SORT_OPTIONS = [
  { value: "points", label: "Rating" },
  { value: "wins", label: "Wins" },
  { value: "winPercentage", label: "Win %" },
  { value: "tournaments", label: "Tournaments" },
  { value: "recent", label: "Recent" },
];

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function LeaderboardPage() {
  const [sortBy, setSortBy] = useState("points");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate } = useSWR<{ data: Row[]; meta?: Meta }>(
    `/api/leaderboard/players?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&sortBy=${sortBy}`,
    swrFetcherWithMeta
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader title="Player Leaderboard" subtitle="Global ranking by Elo rating — everyone starts at 1000; beating a higher-rated player earns more. Across every workspace." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search players…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading && <ListSkeleton rows={8} />}
      {error && <ErrorState onRetry={() => mutate()} />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title="No ranked players" message="Rankings appear once matches are played." icon={Trophy} />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Matches</th>
                  <th className="px-4 py-3 font-medium">Wins</th>
                  <th className="px-4 py-3 font-medium">Losses</th>
                  <th className="px-4 py-3 font-medium">Win %</th>
                  <th className="px-4 py-3 font-medium" title="Elo rating — everyone starts at 1000">Rating</th>
                  <th className="px-4 py-3 font-medium">Tournaments</th>
                  <th className="px-4 py-3 font-medium">Titles</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const medal = r.rank ? MEDALS[r.rank] : undefined;
                  const topThree = r.rank !== null && r.rank <= 3;
                  return (
                    <tr key={r.playerId} className="border-t border-[var(--border)] hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <span className={topThree ? "font-bold text-amber-600 dark:text-amber-400" : "font-semibold text-muted"}>
                          {medal ? `${medal} ` : ""}
                          {r.rank ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/players/${r.playerId}`} className="flex items-center gap-3">
                          <Avatar src={r.photoUrl} name={r.name} size={32} />
                          <span>
                            <span className="font-medium text-foreground hover:underline">{r.name}</span>
                            {r.city && <span className="block text-xs text-muted">{r.city}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{r.matchesPlayed}</td>
                      <td className="px-4 py-3 text-muted">{r.wins}</td>
                      <td className="px-4 py-3 text-muted">{r.losses}</td>
                      <td className="px-4 py-3 text-muted">{pct(r.winPercentage)}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{r.points}</td>
                      <td className="px-4 py-3 text-muted">{r.tournaments}</td>
                      <td className="px-4 py-3 text-muted">{r.titles}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[var(--border)] bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2 disabled:opacity-50"
              disabled={!meta.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="rounded-lg border border-[var(--border)] bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2 disabled:opacity-50"
              disabled={!meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

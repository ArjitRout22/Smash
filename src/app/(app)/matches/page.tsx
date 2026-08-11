"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Pencil } from "lucide-react";
import { swrFetcherWithMeta, type PageMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Card, Button, Badge, statusColor, Select } from "@/components/ui/primitives";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { ScoreEntryModal, type ScorableMatch } from "@/components/ScoreEntryModal";
import { formatDateTime, titleCase } from "@/lib/client/format";
import { MATCH_STATUSES } from "@/lib/domain/constants";
import type { MatchDTO } from "@/components/tournament/types";

export default function MatchesPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [scoreMatch, setScoreMatch] = useState<ScorableMatch | null>(null);

  const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) qs.set("status", status);

  const { data, error, isLoading, mutate } = useSWR<{ data: MatchDTO[]; meta?: PageMeta }>(
    `/api/matches?${qs}`,
    swrFetcherWithMeta
  );

  return (
    <div>
      <PageHeader title="Matches" subtitle="All matches across your tournaments." />

      <div className="mb-4 flex justify-end">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48">
          <option value="">All statuses</option>
          {MATCH_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
      </div>

      {isLoading && <ListSkeleton rows={6} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.data.length === 0 && <EmptyState title="No matches found" message="Create matches from a tournament's Matches tab." />}

      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map((m) => (
            <Card key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={m.winnerSide === "A" ? "font-bold" : "font-medium"}>{m.sides[0]?.label ?? "TBD"}</span>
                  <span className="text-sm font-semibold text-muted">
                    {m.status === "completed" ? `${m.sides[0]?.gamesWon}–${m.sides[1]?.gamesWon}` : "vs"}
                  </span>
                  <span className={m.winnerSide === "B" ? "font-bold" : "font-medium"}>{m.sides[1]?.label ?? "TBD"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  <Link href={`/tournaments/${m.tournament.id}`} className="hover:underline">{m.tournament.name}</Link>
                  {m.stage && ` · ${m.stage.name}`} · Best of {m.bestOf}
                  {m.scheduledAt && ` · ${formatDateTime(m.scheduledAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={statusColor(m.status)}>{titleCase(m.status)}</Badge>
                {can(PERMS.SCORE_EDIT) && m.status !== "cancelled" && m.sides[0]?.label !== "TBD" && m.sides[1]?.label !== "TBD" && (
                  <Button size="sm" variant="outline" onClick={() => setScoreMatch(m)}>
                    <Pencil className="h-3.5 w-3.5" /> {m.status === "completed" ? "Edit" : "Score"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted">Page {data.meta.page} of {data.meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <ScoreEntryModal open={Boolean(scoreMatch)} match={scoreMatch} onClose={() => setScoreMatch(null)} onSaved={() => mutate()} />
    </div>
  );
}

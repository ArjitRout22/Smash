"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Trophy, MapPin, Search } from "lucide-react";
import { swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Card, Badge, statusColor, Button, Select, Input } from "@/components/ui/primitives";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { formatDate, titleCase } from "@/lib/client/format";
import { TOURNAMENT_STATUSES, TOURNAMENT_STATUS_ORDER } from "@/lib/domain/constants";

type Tournament = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  startDate: string | null;
  status: string;
  format: string;
  organizer: { id: string; name: string | null; phone: string } | null;
  _count: { tournamentPlayers: number; teams: number; matches: number };
};

type Meta = { total: number; page: number; totalPages: number; hasNext: boolean; hasPrev: boolean };

export default function TournamentsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const qs = new URLSearchParams({ page: String(page), pageSize: "12" });
  if (status) qs.set("status", status);
  if (search) qs.set("search", search);

  const { data, error, isLoading, mutate } = useSWR<{ data: Tournament[]; meta?: Meta }>(
    `/api/tournaments?${qs}`,
    swrFetcherWithMeta
  );

  return (
    <div>
      <PageHeader
        title="Tournaments"
        subtitle="Create and manage your badminton events."
        actions={
          can(PERMS.TOURNAMENT_CREATE) && (
            <Link href="/tournaments/create">
              <Button><Plus className="h-4 w-4" /> Create tournament</Button>
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search tournaments…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-48">
          <option value="">All statuses</option>
          {TOURNAMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <ErrorState onRetry={() => mutate()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="No tournaments yet"
          message="Create your first tournament to start adding players and matches."
          icon={Trophy}
          action={can(PERMS.TOURNAMENT_CREATE) && <Link href="/tournaments/create"><Button><Plus className="h-4 w-4" /> Create tournament</Button></Link>}
        />
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...data.data]
            .sort((a, b) => {
              // Group by status (upcoming → ongoing → completed → cancelled),
              // then upcoming/ongoing by soonest date, finished by most recent.
              const byStatus = (TOURNAMENT_STATUS_ORDER[a.status] ?? 9) - (TOURNAMENT_STATUS_ORDER[b.status] ?? 9);
              if (byStatus !== 0) return byStatus;
              const at = a.startDate ? new Date(a.startDate).getTime() : 0;
              const bt = b.startDate ? new Date(b.startDate).getTime() : 0;
              const upcoming = a.status === "upcoming" || a.status === "ongoing";
              return upcoming ? at - bt : bt - at;
            })
            .map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}>
              <Card className="h-full p-5 transition hover:border-[var(--primary)]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{t.name}</h3>
                  <Badge color={statusColor(t.status)}>{titleCase(t.status)}</Badge>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted">
                  <Badge color="slate">{titleCase(t.format)}</Badge>
                  {t.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.location}</span>}
                  {t.startDate && <span>{formatDate(t.startDate)}</span>}
                </div>
                <div className="flex gap-4 text-sm text-muted">
                  <span><strong className="text-foreground">{t._count.tournamentPlayers}</strong> players</span>
                  <span><strong className="text-foreground">{t._count.teams}</strong> teams</span>
                  <span><strong className="text-foreground">{t._count.matches}</strong> matches</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination meta={data.meta} onPage={setPage} />
      )}
    </div>
  );
}

function Pagination({ meta, onPage }: { meta: Meta; onPage: (p: number) => void }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => onPage(meta.page - 1)}>Previous</Button>
      <span className="text-sm text-muted">Page {meta.page} of {meta.totalPages}</span>
      <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => onPage(meta.page + 1)}>Next</Button>
    </div>
  );
}

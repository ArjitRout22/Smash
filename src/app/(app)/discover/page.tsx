"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Compass, Search, MapPin } from "lucide-react";
import { swrFetcherWithMeta, type PageMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Card, Badge, statusColor, Button, Input } from "@/components/ui/primitives";
import { mapUrl } from "@/components/LocationPicker";
import { titleCase } from "@/lib/client/format";

type PublicTournament = {
  id: string;
  name: string;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: string;
  format: string;
  organizer: { name: string | null } | null;
  organization: { name: string } | null;
  _count: { tournamentPlayers: number; matches: number };
  viewerStatus: string | null;
  isOwnWorkspace: boolean;
};

/** A "view on map" chip that works inside a clickable card (it won't navigate
 *  the card — it opens maps in a new tab). */
function MapChip({ location, lat, lng }: { location: string | null; lat: number | null; lng: number | null }) {
  if (!location) return null;
  const url = mapUrl(location, lat, lng);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="line-clamp-1 text-left">{location}</span>
    </button>
  );
}

const JOIN_BADGE: Record<string, { text: string; color: "green" | "amber" | "blue" }> = {
  registered: { text: "Joined", color: "green" },
  requested: { text: "Pending", color: "amber" },
  invited: { text: "Invited", color: "blue" },
};

export default function DiscoverPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR<{ data: PublicTournament[]; meta?: PageMeta }>(
    `/api/tournaments/discover?page=${page}&pageSize=12&search=${encodeURIComponent(search)}`,
    swrFetcherWithMeta
  );

  return (
    <div>
      <PageHeader title="Discover" subtitle="Public tournaments across Smash you can request to join." />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search public tournaments…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.data.length === 0 && (
        <EmptyState title="No public tournaments yet" message="When organizers make tournaments public, they'll show up here." icon={Compass} />
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.data.map((t) => (
            <Link key={t.id} href={`/discover/${t.id}`}>
              <Card className="h-full p-5 transition hover:border-[var(--primary)]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{t.name}</h3>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge color={statusColor(t.status)}>{titleCase(t.status)}</Badge>
                    {t.viewerStatus && JOIN_BADGE[t.viewerStatus] && (
                      <Badge color={JOIN_BADGE[t.viewerStatus].color}>{JOIN_BADGE[t.viewerStatus].text}</Badge>
                    )}
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted">
                  <Badge color="slate">{titleCase(t.format)}</Badge>
                  <MapChip location={t.location} lat={t.locationLat} lng={t.locationLng} />
                </div>
                <p className="text-sm text-muted">Hosted by {t.organization?.name ?? t.organizer?.name ?? "—"}</p>
                <div className="mt-2 flex gap-4 text-sm text-muted">
                  <span><strong className="text-foreground">{t._count.tournamentPlayers}</strong> players</span>
                  <span><strong className="text-foreground">{t._count.matches}</strong> matches</span>
                </div>
              </Card>
            </Link>
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
    </div>
  );
}

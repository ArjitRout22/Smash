"use client";

import { MapPin } from "lucide-react";
import { Card, CardHeader, Badge, statusColor } from "@/components/ui/primitives";
import { mapUrl } from "@/components/LocationPicker";
import { formatDate, titleCase } from "@/lib/client/format";
import type { TournamentDetail } from "./types";

export function OverviewTab({ tournament: t }: { tournament: TournamentDetail }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="About" />
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">{t.description || "No description provided."}</p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Format" value={titleCase(t.format)} />
            <Info label="Status" value={<Badge color={statusColor(t.status)}>{titleCase(t.status)}</Badge>} />
            <Info label="Location" value={<LocationValue location={t.location} lat={t.locationLat} lng={t.locationLng} />} />
            <Info label="Organizer" value={t.organizer?.name || t.organizer?.phone || "—"} />
            <Info label="Start date" value={formatDate(t.startDate)} />
            <Info label="End date" value={formatDate(t.endDate)} />
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader title="At a glance" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-[var(--border)]">
          <Stat label="Players" value={t._count.tournamentPlayers} />
          <Stat label="Teams" value={t._count.teams} />
          <Stat label="Matches" value={t._count.matches} />
          <Stat label="Stages" value={t._count.stages} />
        </div>
      </Card>
    </div>
  );
}

function LocationValue({ location, lat, lng }: { location: string | null; lat: number | null; lng: number | null }) {
  if (!location) return <>—</>;
  const url = mapUrl(location, lat, lng);
  return (
    <a href={url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      <MapPin className="h-3.5 w-3.5 shrink-0" />
      <span className="line-clamp-2">{location}</span>
    </a>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface p-5 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

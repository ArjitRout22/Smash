"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { MapPin, UserPlus, Check, Clock } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, CardHeader, Button, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { titleCase } from "@/lib/client/format";

type Nearby = {
  hasLocation: boolean;
  discoverable: boolean;
  players: {
    id: string;
    displayName: string;
    city: string | null;
    skillLevel: string | null;
    distanceKm: number;
    requestStatus: "none" | "requested" | "incoming" | "connected";
  }[];
};

/**
 * "Players near you" — opted-in players around your saved home location, with a
 * one-tap request to play. Replaces the nearby-venues carousel.
 */
export function NearbyPlayers() {
  const toast = useToast();
  const { data, mutate } = useSWR<Nearby>("/api/players/nearby", swrFetcher);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return null;

  // Nothing to show and no reason to nudge → stay out of the way.
  if (data.hasLocation && data.players.length === 0 && data.discoverable) return null;

  async function request(playerId: string) {
    setBusy(playerId);
    try {
      await api.post("/api/play-requests", { toPlayerId: playerId });
      toast.success("Request sent");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send request");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Players near you</span>}
        action={<Link href="/profile" className="text-sm text-primary hover:underline">Settings</Link>}
      />
      <div className="p-5">
        {!data.hasLocation ? (
          <p className="text-sm text-muted">
            Set your home location on your <Link href="/profile" className="text-primary hover:underline">profile</Link> to
            find players nearby.
          </p>
        ) : (
          <>
            {!data.discoverable && (
              <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                You&apos;re not discoverable yet — turn on <b className="text-foreground">Discoverable to nearby players</b> in
                your <Link href="/profile" className="text-primary hover:underline">profile</Link> so others can find you too.
              </p>
            )}
            {data.players.length === 0 ? (
              <p className="text-sm text-muted">No discoverable players within 25 km yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.players.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/players/${p.id}`} className="font-medium text-foreground hover:underline">{p.displayName}</Link>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>~{p.distanceKm} km</span>
                        {p.city && <span>· {p.city}</span>}
                        {p.skillLevel && <Badge color="slate">{titleCase(p.skillLevel)}</Badge>}
                      </p>
                    </div>
                    {p.requestStatus === "connected" ? (
                      <Badge color="green"><span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Connected</span></Badge>
                    ) : p.requestStatus === "requested" ? (
                      <Badge color="amber"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Requested</span></Badge>
                    ) : p.requestStatus === "incoming" ? (
                      <Badge color="blue">Wants to play</Badge>
                    ) : (
                      <Button size="sm" variant="outline" loading={busy === p.id} onClick={() => request(p.id)}>
                        <UserPlus className="h-3.5 w-3.5" /> Play
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

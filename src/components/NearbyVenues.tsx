"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { MapPin, Search, Compass } from "lucide-react";
import { swrFetcher } from "@/lib/client/api";
import { Card, CardHeader, Input } from "@/components/ui/primitives";
import { ViewOnMapButton } from "@/components/LocationPicker";
import { useAuth } from "@/components/AuthProvider";

type PlayerLoc = {
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
};
type Venue = { display_name: string; lat: string; lon: string };

/**
 * Dashboard carousel of badminton venues near the signed-in player's saved home
 * location, via a live OpenStreetMap (Nominatim) search bounded to a ~15km box
 * around their coordinates. Queried from the browser (no server proxy), like the
 * LocationPicker. Prompts the user to set their location if none is saved yet.
 */
export function NearbyVenues() {
  const { user } = useAuth();
  const playerId = user?.playerId ?? null;
  const { data: player } = useSWR<PlayerLoc>(playerId ? `/api/players/${playerId}` : null, swrFetcher);
  const hasLoc = player?.locationLat != null && player?.locationLng != null;

  const [term, setTerm] = useState("badminton");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasLoc || !player) return;
    const q = term.trim() || "badminton";
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const lat = player.locationLat!;
        const lng = player.locationLng!;
        const d = 0.15; // ~15km bounding box (degrees)
        // Nominatim viewbox is left,top,right,bottom = minLon,maxLat,maxLon,minLat.
        const viewbox = `${lng - d},${lat + d},${lng + d},${lat - d}`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=12&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } }
        );
        const j = await res.json();
        setVenues(Array.isArray(j) ? j : []);
      } catch {
        setVenues([]);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term, hasLoc, player]);

  if (!playerId) return null;

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader
        title={<span className="flex items-center gap-2"><Compass className="h-4 w-4" /> Badminton venues near you</span>}
        subtitle={hasLoc ? player?.locationName ?? undefined : undefined}
      />
      {!hasLoc ? (
        <div className="px-5 py-6 text-sm text-muted">
          Set your location on your <Link href="/profile" className="text-primary hover:underline">profile</Link> to
          discover badminton courts and clubs nearby.
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="relative mb-3 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search venues (e.g. badminton)" />
          </div>
          {loading && <p className="text-sm text-muted">Searching nearby…</p>}
          {!loading && venues.length === 0 && (
            <p className="text-sm text-muted">No venues found nearby. Try a different search term.</p>
          )}
          {venues.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {venues.map((v, i) => {
                const name = v.display_name.split(",")[0];
                return (
                  <div key={i} className="flex w-56 shrink-0 flex-col justify-between gap-3 rounded-lg border border-[var(--border)] bg-surface p-3">
                    <div className="min-w-0">
                      <p className="flex items-start gap-1 text-sm font-medium text-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="line-clamp-1">{name}</span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{v.display_name}</p>
                    </div>
                    <ViewOnMapButton location={v.display_name} lat={parseFloat(v.lat)} lng={parseFloat(v.lon)} />
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted">Powered by OpenStreetMap</p>
        </div>
      )}
    </Card>
  );
}

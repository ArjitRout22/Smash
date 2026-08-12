"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/primitives";

export type PlaceValue = { name: string; lat: number | null; lng: number | null };
type Suggestion = { display_name: string; lat: string; lon: string };

/**
 * Location field with OpenStreetMap (Nominatim) place search — free, no API key.
 * Typing shows real place suggestions; picking one stores the name + coordinates.
 * Free text is still allowed (coords just stay null if you don't pick a place).
 */
export function LocationPicker({
  value,
  onChange,
  placeholder,
}: {
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value.name);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when the value name changes from outside (e.g. an edit form loads).
  const [synced, setSynced] = useState(value.name);
  if (value.name !== synced) {
    setSynced(value.name);
    setQuery(value.name);
  }

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 3) return; // dropdown is hidden below 3 chars anyway
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } }
        );
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open]);

  function pick(s: Suggestion) {
    onChange({ name: s.display_name, lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setQuery(s.display_name);
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onChange({ name: "", lat: null, lng: null });
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9 pr-9"
          value={query}
          placeholder={placeholder ?? "Search a place…"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Typing invalidates any previously picked coordinates.
            onChange({ name: e.target.value, lat: null, lng: null });
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {query && (
          <button type="button" onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Clear location">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 3 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--border)] bg-surface shadow-lg">
          {loading && <p className="px-3 py-2 text-sm text-muted">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-sm text-muted">No places found — you can also just type an address.</p>}
          {results.map((s, i) => (
            <button key={i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="line-clamp-2">{s.display_name}</span>
            </button>
          ))}
          <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-muted">Powered by OpenStreetMap</p>
        </div>
      )}
    </div>
  );
}

/** A Google/Apple-friendly "view on map" URL from coordinates or place text. */
export function mapUrl(location: string | null, lat: number | null, lng: number | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (location && location.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
  return null;
}

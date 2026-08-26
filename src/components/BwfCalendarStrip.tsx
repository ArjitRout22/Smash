"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Globe, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  selectCircuitEvents,
  eventUrl,
  eventTag,
  eventTagColor,
  BWF_CALENDAR_URL,
  type DatedCircuitEvent,
} from "@/lib/data/bwf-calendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact inclusive range: "6–11 Oct", cross-month "27 Oct–1 Nov". */
function formatRange(startIso: string, endIso: string): string {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  const sd = s.getDate();
  const ed = e.getDate();
  const sm = MONTHS[s.getMonth()];
  const em = MONTHS[e.getMonth()];
  return s.getMonth() === e.getMonth() ? `${sd}–${ed} ${sm}` : `${sd} ${sm}–${ed} ${em}`;
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

/**
 * Dashboard "BWF & India" strip — collapsed by default so it costs one thin row.
 * Shows which BWF World Tour and Indian domestic (BAI) events are live/upcoming
 * (computed from a curated calendar) and links out to BWF's live scores or the
 * BAI site. No in-app live feed. Computes on the client after mount (avoids
 * SSR/CSR date drift); renders nothing until then, and nothing once every event
 * is in the past.
 */
export function BwfCalendarStrip() {
  const [events, setEvents] = useState<DatedCircuitEvent[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // One-time read of the client's current date; can't derive during SSR render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents(selectCircuitEvents(new Date()));
  }, []);

  if (!events || events.length === 0) return null;

  const liveCount = events.filter((e) => e.status === "live").length;
  const next = events[0];
  const shown = events.slice(0, 10);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-[var(--border)] bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2/40"
      >
        <Globe className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium text-foreground">BWF &amp; India</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {liveCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <LiveDot /> {liveCount} live now
            </span>
          ) : (
            <>Next: {next.name} · {formatRange(next.start, next.end)}</>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
          {shown.map((e) => {
            const isLive = e.status === "live";
            return (
              <a
                key={`${e.name}-${e.start}`}
                href={eventUrl(e)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                    {isLive && <LiveDot />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <Badge color={eventTagColor(e)}>{eventTag(e)}</Badge>
                    <span className="truncate">{e.city}, {e.country}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      {e.source === "india" ? "Details" : "Live scores"} <ExternalLink className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="tabular-nums text-muted">{formatRange(e.start, e.end)}</span>
                  )}
                </div>
              </a>
            );
          })}
          <a
            href={BWF_CALENDAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-primary hover:underline"
          >
            Full BWF calendar <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

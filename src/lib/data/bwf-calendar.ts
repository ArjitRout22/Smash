/**
 * Curated 2026 BWF World Tour calendar (Super 300 and above + the World Tour
 * Finals). Powers the dashboard's compact "International" strip — a link-out to
 * BWF's own live scores, NOT an in-app live feed (there is no free official BWF
 * API). Update this list once a year when BWF publishes the next season; keep it
 * chronological. Dates are inclusive local calendar days (ISO yyyy-mm-dd).
 */
export type BwfLevel =
  | "Super 1000"
  | "Super 750"
  | "Super 500"
  | "Super 300"
  | "World Tour Finals";

export interface BwfEvent {
  name: string;
  city: string;
  country: string;
  /** First day, ISO yyyy-mm-dd. */
  start: string;
  /** Last day (inclusive), ISO yyyy-mm-dd. */
  end: string;
  level: BwfLevel;
}

/** Official BWF live-scores hub — always current, so we deep-link out to it. */
export const BWF_LIVE_URL = "https://bwfbadminton.com/live-scores/";
/** Official BWF World Tour calendar (for upcoming events / "full calendar"). */
export const BWF_CALENDAR_URL = "https://bwfworldtour.bwfbadminton.com/calendar/";

// Source: BWF 2026 World Tour calendar (Super 300+). Verified Aug 2026.
export const BWF_CALENDAR: BwfEvent[] = [
  { name: "China Masters", city: "Shenzhen", country: "China", start: "2026-09-01", end: "2026-09-06", level: "Super 750" },
  { name: "Korea Open", city: "Yeosu", country: "Korea", start: "2026-09-08", end: "2026-09-13", level: "Super 500" },
  { name: "Arctic Open", city: "Vantaa", country: "Finland", start: "2026-10-06", end: "2026-10-11", level: "Super 500" },
  { name: "Denmark Open", city: "Odense", country: "Denmark", start: "2026-10-13", end: "2026-10-18", level: "Super 750" },
  { name: "French Open", city: "Paris", country: "France", start: "2026-10-20", end: "2026-10-25", level: "Super 750" },
  { name: "Hylo Open", city: "Saarbrücken", country: "Germany", start: "2026-10-27", end: "2026-11-01", level: "Super 500" },
  { name: "Korea Masters", city: "Gwangju", country: "Korea", start: "2026-11-03", end: "2026-11-08", level: "Super 300" },
  { name: "Japan Masters", city: "Kumamoto", country: "Japan", start: "2026-11-10", end: "2026-11-15", level: "Super 500" },
  { name: "Hong Kong Open", city: "Hong Kong", country: "China", start: "2026-11-17", end: "2026-11-22", level: "Super 500" },
  { name: "Syed Modi India International", city: "Lucknow", country: "India", start: "2026-11-24", end: "2026-11-29", level: "Super 300" },
  { name: "BWF World Tour Finals", city: "Hangzhou", country: "China", start: "2026-12-09", end: "2026-12-13", level: "World Tour Finals" },
];

export type EventStatus = "live" | "upcoming";

export interface DatedBwfEvent extends BwfEvent {
  status: EventStatus;
}

/**
 * The events worth showing right now — those live or still upcoming — soonest
 * first. Past events are dropped. Pure (takes `now`) so it's easy to unit-test.
 */
export function selectInternationalEvents(now: Date, calendar: BwfEvent[] = BWF_CALENDAR): DatedBwfEvent[] {
  return calendar
    .map((e) => {
      const start = new Date(`${e.start}T00:00:00`);
      const end = new Date(`${e.end}T23:59:59`);
      const status: EventStatus | null =
        now.getTime() > end.getTime() ? null : now.getTime() >= start.getTime() ? "live" : "upcoming";
      return { event: e, startMs: start.getTime(), status };
    })
    .filter((x): x is { event: BwfEvent; startMs: number; status: EventStatus } => x.status !== null)
    .sort((a, b) => a.startMs - b.startMs)
    .map((x) => ({ ...x.event, status: x.status }));
}

/** Badge colour for each tour level (keys match the ui Badge component). */
export function levelColor(level: BwfLevel): "amber" | "blue" | "slate" | "green" {
  switch (level) {
    case "World Tour Finals":
      return "green";
    case "Super 1000":
    case "Super 750":
      return "amber";
    case "Super 500":
      return "blue";
    default:
      return "slate";
  }
}

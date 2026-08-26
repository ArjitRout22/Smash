/**
 * Curated badminton circuit calendar for the dashboard's compact strip — the
 * international BWF World Tour PLUS the Indian domestic circuit (BAI). It's a
 * link-out (to BWF live scores / the BAI site), NOT an in-app live feed: there is
 * no free official API for either. Refresh once a year when the calendars publish.
 *
 * Curation rule:
 *  - BWF: international majors (Super 300+) + the World Tour Finals, PLUS every
 *    India-hosted BWF event of any tier.
 *  - India (BAI): the notable senior events — All India Senior Ranking, the
 *    National Championships (senior/junior/sub-junior), and India International
 *    Challenges. (The many age-group sub-junior ranking legs are omitted.)
 *
 * Dates are inclusive local calendar days (ISO yyyy-mm-dd).
 */
export type BwfLevel =
  | "Super 1000"
  | "Super 750"
  | "Super 500"
  | "Super 300"
  | "Super 100"
  | "World Tour Finals";

export type EventSource = "bwf" | "india";

export interface CircuitEvent {
  name: string;
  city: string;
  country: string;
  /** First day, ISO yyyy-mm-dd. */
  start: string;
  /** Last day (inclusive), ISO yyyy-mm-dd. */
  end: string;
  source: EventSource;
  /** BWF tour tier (BWF events only). */
  level?: BwfLevel;
  /** Short category tag for India domestic events (e.g. "Senior Ranking"). */
  category?: string;
}

/** Official BWF live-scores hub — always current, so we deep-link out to it. */
export const BWF_LIVE_URL = "https://bwfbadminton.com/live-scores/";
/** Official BWF World Tour calendar (for upcoming events / "full calendar"). */
export const BWF_CALENDAR_URL = "https://bwfworldtour.bwfbadminton.com/calendar/";
/** Badminton Association of India — domestic schedule & results (no live feed). */
export const BAI_URL = "https://www.badmintonindia.org/";

// Source: BWF 2026 World Tour calendar (Super 300+ and India-hosted). Verified Aug 2026.
const BWF_CALENDAR: CircuitEvent[] = [
  { name: "China Masters", city: "Shenzhen", country: "China", start: "2026-09-01", end: "2026-09-06", source: "bwf", level: "Super 750" },
  { name: "Korea Open", city: "Yeosu", country: "Korea", start: "2026-09-08", end: "2026-09-13", source: "bwf", level: "Super 500" },
  { name: "Arctic Open", city: "Vantaa", country: "Finland", start: "2026-10-06", end: "2026-10-11", source: "bwf", level: "Super 500" },
  { name: "Denmark Open", city: "Odense", country: "Denmark", start: "2026-10-13", end: "2026-10-18", source: "bwf", level: "Super 750" },
  { name: "French Open", city: "Paris", country: "France", start: "2026-10-20", end: "2026-10-25", source: "bwf", level: "Super 750" },
  { name: "Hylo Open", city: "Saarbrücken", country: "Germany", start: "2026-10-27", end: "2026-11-01", source: "bwf", level: "Super 500" },
  { name: "Korea Masters", city: "Gwangju", country: "Korea", start: "2026-11-03", end: "2026-11-08", source: "bwf", level: "Super 300" },
  { name: "Japan Masters", city: "Kumamoto", country: "Japan", start: "2026-11-10", end: "2026-11-15", source: "bwf", level: "Super 500" },
  { name: "Hong Kong Open", city: "Hong Kong", country: "China", start: "2026-11-17", end: "2026-11-22", source: "bwf", level: "Super 500" },
  { name: "Syed Modi India International", city: "Lucknow", country: "India", start: "2026-11-24", end: "2026-11-29", source: "bwf", level: "Super 300" },
  { name: "Guwahati Masters", city: "Guwahati", country: "India", start: "2026-12-01", end: "2026-12-06", source: "bwf", level: "Super 100" },
  { name: "Odisha Masters", city: "Cuttack", country: "India", start: "2026-12-08", end: "2026-12-13", source: "bwf", level: "Super 100" },
  { name: "BWF World Tour Finals", city: "Hangzhou", country: "China", start: "2026-12-09", end: "2026-12-13", source: "bwf", level: "World Tour Finals" },
];

// Source: BAI 2026-27 domestic calendar (notable senior/national + India Int'l Challenge). Verified Aug 2026.
const INDIA_CALENDAR: CircuitEvent[] = [
  { name: "All India Senior Ranking", city: "Uttar Pradesh", country: "India", start: "2026-09-21", end: "2026-09-28", source: "india", category: "Senior Ranking" },
  { name: "All India Junior Ranking (U-19)", city: "Goa", country: "India", start: "2026-10-23", end: "2026-10-30", source: "india", category: "Junior Ranking" },
  { name: "Chhattisgarh India International Challenge", city: "Raipur", country: "India", start: "2026-10-27", end: "2026-11-01", source: "india", category: "Int'l Challenge" },
  { name: "Infosys Foundation India International Challenge", city: "Bengaluru", country: "India", start: "2026-11-03", end: "2026-11-08", source: "india", category: "Int'l Challenge" },
  { name: "49th Junior National Championships (U-19)", city: "Gangtok", country: "India", start: "2026-11-14", end: "2026-11-21", source: "india", category: "Junior Nationals" },
  { name: "38th Sub-Junior National Championships", city: "Bengaluru", country: "India", start: "2026-11-30", end: "2026-12-05", source: "india", category: "Sub-Junior Nationals" },
  { name: "88th Senior National Championships", city: "Bhubaneswar", country: "India", start: "2027-01-23", end: "2027-01-30", source: "india", category: "Senior Nationals" },
];

/** The full circuit calendar (BWF + India), chronological. */
export const CIRCUIT_CALENDAR: CircuitEvent[] = [...BWF_CALENDAR, ...INDIA_CALENDAR].sort((a, b) =>
  a.start < b.start ? -1 : a.start > b.start ? 1 : 0
);

export type EventStatus = "live" | "upcoming";

export interface DatedCircuitEvent extends CircuitEvent {
  status: EventStatus;
}

/**
 * The events worth showing right now — those live or still upcoming — soonest
 * first. Past events are dropped. Pure (takes `now`) so it's easy to unit-test.
 */
export function selectCircuitEvents(now: Date, calendar: CircuitEvent[] = CIRCUIT_CALENDAR): DatedCircuitEvent[] {
  return calendar
    .map((e) => {
      const start = new Date(`${e.start}T00:00:00`);
      const end = new Date(`${e.end}T23:59:59`);
      const status: EventStatus | null =
        now.getTime() > end.getTime() ? null : now.getTime() >= start.getTime() ? "live" : "upcoming";
      return { event: e, startMs: start.getTime(), status };
    })
    .filter((x): x is { event: CircuitEvent; startMs: number; status: EventStatus } => x.status !== null)
    .sort((a, b) => a.startMs - b.startMs)
    .map((x) => ({ ...x.event, status: x.status }));
}

/** Where an event links out to: BWF live scores / calendar, or the BAI site. */
export function eventUrl(e: DatedCircuitEvent): string {
  if (e.source === "india") return BAI_URL;
  return e.status === "live" ? BWF_LIVE_URL : BWF_CALENDAR_URL;
}

/** Short tag shown next to each event (tour tier for BWF, category for India). */
export function eventTag(e: CircuitEvent): string {
  return e.source === "india" ? `🇮🇳 ${e.category ?? "India"}` : e.level ?? "BWF";
}

/** Badge colour for the event tag (keys match the ui Badge component). */
export function eventTagColor(e: CircuitEvent): "amber" | "blue" | "slate" | "green" {
  if (e.source === "india") return "slate";
  switch (e.level) {
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

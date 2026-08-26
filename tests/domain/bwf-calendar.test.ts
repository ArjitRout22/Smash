import { describe, it, expect } from "vitest";
import {
  selectCircuitEvents,
  eventTag,
  eventTagColor,
  eventUrl,
  BAI_URL,
  BWF_LIVE_URL,
  type CircuitEvent,
} from "@/lib/data/bwf-calendar";

const CAL: CircuitEvent[] = [
  { name: "Past Open", city: "A", country: "X", start: "2026-01-05", end: "2026-01-10", source: "bwf", level: "Super 500" },
  { name: "Live Open", city: "B", country: "Y", start: "2026-06-01", end: "2026-06-07", source: "bwf", level: "Super 750" },
  { name: "Soon Open", city: "C", country: "Z", start: "2026-06-15", end: "2026-06-20", source: "bwf", level: "Super 300" },
  { name: "India Ranking", city: "Lucknow", country: "India", start: "2026-06-16", end: "2026-06-22", source: "india", category: "Senior Ranking" },
  { name: "Later Finals", city: "D", country: "W", start: "2026-12-09", end: "2026-12-13", source: "bwf", level: "World Tour Finals" },
];

describe("selectCircuitEvents", () => {
  it("drops past events, keeps live + upcoming, soonest first", () => {
    const now = new Date("2026-06-03T09:00:00");
    const out = selectCircuitEvents(now, CAL);
    expect(out.map((e) => e.name)).toEqual(["Live Open", "Soon Open", "India Ranking", "Later Finals"]);
    expect(out[0].status).toBe("live");
    expect(out[1].status).toBe("upcoming");
  });

  it("treats the end date as inclusive (through end of day)", () => {
    const lastDayEvening = new Date("2026-06-07T22:00:00");
    const out = selectCircuitEvents(lastDayEvening, CAL);
    expect(out.find((e) => e.name === "Live Open")?.status).toBe("live");
  });

  it("marks an event upcoming right before it starts and drops it right after it ends", () => {
    expect(selectCircuitEvents(new Date("2026-05-31T23:59:00"), CAL).find((e) => e.name === "Live Open")?.status).toBe("upcoming");
    expect(selectCircuitEvents(new Date("2026-06-08T00:00:01"), CAL).some((e) => e.name === "Live Open")).toBe(false);
  });

  it("returns empty once every event is in the past", () => {
    expect(selectCircuitEvents(new Date("2027-06-01T00:00:00"), CAL)).toEqual([]);
  });

  it("tags + colours events by source", () => {
    expect(eventTagColor({ ...CAL[4] })).toBe("green"); // World Tour Finals
    expect(eventTagColor({ ...CAL[1] })).toBe("amber"); // Super 750
    expect(eventTagColor({ ...CAL[2] })).toBe("slate"); // Super 300
    expect(eventTagColor({ ...CAL[3] })).toBe("slate"); // India
    expect(eventTag(CAL[1])).toBe("Super 750");
    expect(eventTag(CAL[3])).toBe("🇮🇳 Senior Ranking");
  });

  it("links BWF live events to BWF and India events to BAI", () => {
    expect(eventUrl({ ...CAL[1], status: "live" })).toBe(BWF_LIVE_URL);
    expect(eventUrl({ ...CAL[3], status: "live" })).toBe(BAI_URL);
    expect(eventUrl({ ...CAL[3], status: "upcoming" })).toBe(BAI_URL);
  });
});

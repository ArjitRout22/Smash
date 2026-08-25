import { describe, it, expect } from "vitest";
import { selectInternationalEvents, levelColor, type BwfEvent } from "@/lib/data/bwf-calendar";

const CAL: BwfEvent[] = [
  { name: "Past Open", city: "A", country: "X", start: "2026-01-05", end: "2026-01-10", level: "Super 500" },
  { name: "Live Open", city: "B", country: "Y", start: "2026-06-01", end: "2026-06-07", level: "Super 750" },
  { name: "Soon Open", city: "C", country: "Z", start: "2026-06-15", end: "2026-06-20", level: "Super 300" },
  { name: "Later Finals", city: "D", country: "W", start: "2026-12-09", end: "2026-12-13", level: "World Tour Finals" },
];

describe("selectInternationalEvents", () => {
  it("drops past events, keeps live + upcoming, soonest first", () => {
    const now = new Date("2026-06-03T09:00:00");
    const out = selectInternationalEvents(now, CAL);
    expect(out.map((e) => e.name)).toEqual(["Live Open", "Soon Open", "Later Finals"]);
    expect(out[0].status).toBe("live");
    expect(out[1].status).toBe("upcoming");
  });

  it("treats the end date as inclusive (through end of day)", () => {
    const lastDayEvening = new Date("2026-06-07T22:00:00");
    const out = selectInternationalEvents(lastDayEvening, CAL);
    expect(out.find((e) => e.name === "Live Open")?.status).toBe("live");
  });

  it("marks an event upcoming right before it starts and drops it right after it ends", () => {
    expect(selectInternationalEvents(new Date("2026-05-31T23:59:00"), CAL).find((e) => e.name === "Live Open")?.status).toBe("upcoming");
    expect(selectInternationalEvents(new Date("2026-06-08T00:00:01"), CAL).some((e) => e.name === "Live Open")).toBe(false);
  });

  it("returns empty once every event is in the past", () => {
    expect(selectInternationalEvents(new Date("2027-01-01T00:00:00"), CAL)).toEqual([]);
  });

  it("maps tour levels to badge colours", () => {
    expect(levelColor("World Tour Finals")).toBe("green");
    expect(levelColor("Super 750")).toBe("amber");
    expect(levelColor("Super 500")).toBe("blue");
    expect(levelColor("Super 300")).toBe("slate");
    expect(levelColor("Super 100")).toBe("slate");
  });
});

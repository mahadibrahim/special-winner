/**
 * Pure date-math tests for campDayInstants (src/lib/camps/materialize.ts).
 *
 * These deliberately use FIXED calendar dates — the plan's "anchor fixtures
 * to new Date()" rule explicitly exempts pure unit tests of date math, and
 * the DST assertions below only mean anything against known transition
 * dates (US DST starts Sunday 2026-03-08).
 */
import { describe, it, expect } from "vitest";
import { campDayInstants } from "@/lib/camps/materialize";

const TZ = "America/New_York";
// Wide-open cron window so season dates alone drive the clamp.
const WIDE_FROM = new Date("2026-01-01T12:00:00Z");
const WIDE_TO = new Date("2026-01-31T12:00:00Z");

describe("campDayInstants", () => {
  it("yields 5 instants at the right UTC times for a Mon-Fri week in America/New_York", () => {
    const out = campDayInstants(
      {
        startDate: "2026-01-05", // Monday
        endDate: "2026-01-09", // Friday
        startTime: "09:00:00",
        endTime: "15:00:00",
      },
      TZ,
      WIDE_FROM,
      WIDE_TO,
    );
    expect(out).toHaveLength(5);
    // January = EST (UTC-5): 09:00 wall clock = 14:00Z, 15:00 = 20:00Z.
    expect(out[0].startsAt.toISOString()).toBe("2026-01-05T14:00:00.000Z");
    expect(out[0].endsAt.toISOString()).toBe("2026-01-05T20:00:00.000Z");
    expect(out[4].startsAt.toISOString()).toBe("2026-01-09T14:00:00.000Z");
    // No weekend days in the output.
    for (const { startsAt } of out) {
      const dow = startsAt.getUTCDay(); // 14:00Z stays same-day in UTC
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
  });

  it("skips the leading weekend when the season starts on a Saturday", () => {
    const out = campDayInstants(
      {
        startDate: "2026-01-10", // Saturday
        endDate: "2026-01-16", // Friday
        startTime: "09:00:00",
        endTime: "15:00:00",
      },
      TZ,
      WIDE_FROM,
      WIDE_TO,
    );
    expect(out).toHaveLength(5);
    expect(out[0].startsAt.toISOString()).toBe("2026-01-12T14:00:00.000Z"); // Monday
    expect(out[4].startsAt.toISOString()).toBe("2026-01-16T14:00:00.000Z"); // Friday
  });

  it("clamps to the [from, to] window at civil-day granularity in the org timezone", () => {
    const out = campDayInstants(
      {
        startDate: "2026-01-05",
        endDate: "2026-01-09",
        startTime: "09:00:00",
        endTime: "15:00:00",
      },
      TZ,
      // 14:00Z on Jan 7 = 09:00 EST Jan 7 -> from-day is Jan 7 (inclusive).
      new Date("2026-01-07T14:00:00Z"),
      // 23:00Z on Jan 8 = 18:00 EST Jan 8 -> to-day is Jan 8 (inclusive).
      new Date("2026-01-08T23:00:00Z"),
    );
    expect(out.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-01-07T14:00:00.000Z",
      "2026-01-08T14:00:00.000Z",
    ]);
  });

  it("resolves the from/to civil days in the ORG timezone, not UTC", () => {
    const out = campDayInstants(
      {
        startDate: "2026-01-05",
        endDate: "2026-01-09",
        startTime: "09:00:00",
        endTime: "15:00:00",
      },
      TZ,
      WIDE_FROM,
      // 02:00Z on Jan 8 is still 21:00 EST Jan 7 -> to-day is Jan 7,
      // so Jan 8 must NOT appear even though the instant is "Jan 8" in UTC.
      new Date("2026-01-08T02:00:00Z"),
    );
    expect(out.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-01-05T14:00:00.000Z",
      "2026-01-06T14:00:00.000Z",
      "2026-01-07T14:00:00.000Z",
    ]);
  });

  it("defaults null startTime/endTime to 09:00-15:00", () => {
    const out = campDayInstants(
      { startDate: "2026-01-05", endDate: "2026-01-05", startTime: null, endTime: null },
      TZ,
      WIDE_FROM,
      WIDE_TO,
    );
    expect(out).toHaveLength(1);
    expect(out[0].startsAt.toISOString()).toBe("2026-01-05T14:00:00.000Z");
    expect(out[0].endsAt.toISOString()).toBe("2026-01-05T20:00:00.000Z");
  });

  it("keeps 9am wall-clock across the spring-forward DST boundary (2026-03-08)", () => {
    const out = campDayInstants(
      {
        startDate: "2026-03-02", // Monday before DST
        endDate: "2026-03-13", // Friday after DST
        startTime: "09:00:00",
        endTime: "15:00:00",
      },
      TZ,
      new Date("2026-03-01T12:00:00Z"),
      new Date("2026-03-15T12:00:00Z"),
    );
    expect(out).toHaveLength(10); // two full Mon-Fri weeks
    const byDay = new Map(out.map((o) => [o.startsAt.toISOString().slice(0, 10), o]));
    // Fri Mar 6: EST, 09:00 wall = 14:00Z.
    expect(byDay.get("2026-03-06")!.startsAt.toISOString()).toBe("2026-03-06T14:00:00.000Z");
    // Mon Mar 9: EDT, 09:00 wall = 13:00Z.
    expect(byDay.get("2026-03-09")!.startsAt.toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(byDay.get("2026-03-09")!.endsAt.toISOString()).toBe("2026-03-09T19:00:00.000Z");
  });

  it("returns [] when the season range and the window do not intersect", () => {
    const out = campDayInstants(
      { startDate: "2026-02-02", endDate: "2026-02-06", startTime: "09:00:00", endTime: "15:00:00" },
      TZ,
      new Date("2026-01-01T12:00:00Z"),
      new Date("2026-01-10T12:00:00Z"),
    );
    expect(out).toEqual([]);
  });
});

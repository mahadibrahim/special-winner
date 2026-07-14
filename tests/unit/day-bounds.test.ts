import { describe, expect, it } from "vitest";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

const ET = "America/New_York";

describe("dayBoundsInTz", () => {
  it("bounds the local day, not the UTC day", () => {
    // 8:30pm ET on Jul 13 === 00:30 UTC on Jul 14. The UTC day has rolled
    // over but the *local* day is still Jul 13.
    const now = new Date("2026-07-14T00:30:00Z");
    const { start, end } = dayBoundsInTz(ET, now);
    // Local Jul 13 00:00 ET === 04:00 UTC (EDT, UTC-4).
    expect(start.toISOString()).toBe("2026-07-13T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-14T04:00:00.000Z");
  });

  it("keeps an evening session inside today's bounds (the regression)", () => {
    const now = new Date("2026-07-14T00:30:00Z"); // 8:30pm ET Jul 13
    const sixPmEt = new Date("2026-07-13T22:00:00Z"); // 6pm ET Jul 13
    const { start, end } = dayBoundsInTz(ET, now);
    expect(sixPmEt >= start && sixPmEt < end).toBe(true);
  });

  it("handles a timezone west of UTC at midday", () => {
    const now = new Date("2026-07-13T16:00:00Z"); // 12pm ET
    const { start, end } = dayBoundsInTz(ET, now);
    expect(start.toISOString()).toBe("2026-07-13T04:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("falls back to Eastern on an unknown timezone rather than throwing", () => {
    const now = new Date("2026-07-13T16:00:00Z");
    expect(() => dayBoundsInTz("Not/AZone", now)).not.toThrow();
    expect(dayBoundsInTz("Not/AZone", now).start.toISOString()).toBe(
      dayBoundsInTz(ET, now).start.toISOString(),
    );
  });
});

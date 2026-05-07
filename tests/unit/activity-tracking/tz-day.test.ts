import { describe, it, expect } from "vitest";
import { tzDayBoundsUtc } from "../../../src/lib/activity-tracking/tz-day";

describe("tzDayBoundsUtc", () => {
  it("returns midnight-to-end UTC for a date in America/New_York during EDT", () => {
    // 2026-08-15 in America/New_York during EDT (UTC-4):
    //   00:00 local → 04:00 UTC, 23:59:59.999 local → 03:59:59.999 next day UTC
    const { startUtc, endUtc } = tzDayBoundsUtc("2026-08-15", "America/New_York");
    expect(startUtc.toISOString()).toBe("2026-08-15T04:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-08-16T03:59:59.999Z");
  });

  it("returns midnight-to-end UTC for a date in America/New_York during EST", () => {
    // 2026-12-15 in America/New_York during EST (UTC-5):
    //   00:00 local → 05:00 UTC, 23:59:59.999 local → 04:59:59.999 next day UTC
    const { startUtc, endUtc } = tzDayBoundsUtc("2026-12-15", "America/New_York");
    expect(startUtc.toISOString()).toBe("2026-12-15T05:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-12-16T04:59:59.999Z");
  });

  it("handles UTC tz as a no-op", () => {
    const { startUtc, endUtc } = tzDayBoundsUtc("2026-06-01", "UTC");
    expect(startUtc.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-06-01T23:59:59.999Z");
  });

  it("rejects malformed date", () => {
    expect(() => tzDayBoundsUtc("not-a-date", "UTC")).toThrow();
  });
});

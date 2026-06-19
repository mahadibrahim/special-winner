import { describe, it, expect } from "vitest";
import { tzDayBoundsUtc, zonedMinuteToUtc } from "../../../src/lib/activity-tracking/tz-day";

const TZ = "America/New_York";

describe("zonedMinuteToUtc", () => {
  it("non-transition summer day: 4 PM ET (960 min) on 2026-07-01 = 20:00Z (EDT)", () => {
    expect(zonedMinuteToUtc("2026-07-01", 960, TZ).toISOString()).toBe(
      "2026-07-01T20:00:00.000Z",
    );
  });

  it("spring-forward Sunday: 4 PM ET (960 min) on 2026-03-08 = 20:00Z (EDT)", () => {
    // Anchored to local midnight the offset is still EST (-5); naive
    // midnight+minutes math would give 21:00Z. Instant-anchored gives 20:00Z.
    expect(zonedMinuteToUtc("2026-03-08", 960, TZ).toISOString()).toBe(
      "2026-03-08T20:00:00.000Z",
    );
  });

  it("fall-back Sunday: 4 PM ET (960 min) on 2026-11-01 = 21:00Z (EST)", () => {
    expect(zonedMinuteToUtc("2026-11-01", 960, TZ).toISOString()).toBe(
      "2026-11-01T21:00:00.000Z",
    );
  });

  it("midnight close: 1440 min on 2026-07-01 = next local midnight = 04:00Z next day", () => {
    expect(zonedMinuteToUtc("2026-07-01", 1440, TZ).toISOString()).toBe(
      "2026-07-02T04:00:00.000Z",
    );
  });

  it("non-whole-hour minute: 9:30 AM ET (570 min) on 2026-07-01 = 13:30Z", () => {
    expect(zonedMinuteToUtc("2026-07-01", 570, TZ).toISOString()).toBe(
      "2026-07-01T13:30:00.000Z",
    );
  });

  it("rejects out-of-range minute", () => {
    expect(() => zonedMinuteToUtc("2026-07-01", 1441, TZ)).toThrow();
    expect(() => zonedMinuteToUtc("2026-07-01", -1, TZ)).toThrow();
  });

  it("rejects malformed date", () => {
    expect(() => zonedMinuteToUtc("nope", 960, TZ)).toThrow();
  });
});

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

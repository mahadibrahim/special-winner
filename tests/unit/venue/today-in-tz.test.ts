import { describe, it, expect } from "vitest";
import { todayInTimeZone } from "@/lib/venue/today-in-tz";

describe("todayInTimeZone", () => {
  it("returns the wall-clock date in America/New_York, not the UTC date", () => {
    // 2026-07-12T01:16:00Z is 2026-07-11 21:16 ET (Saturday night) — the
    // exact live-smoke scenario: UTC has already rolled to Sunday.
    const instant = new Date("2026-07-12T01:16:00Z");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-07-11");
  });

  it("returns the UTC calendar date when timeZone is UTC", () => {
    const instant = new Date("2026-07-12T01:16:00Z");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-07-12");
  });

  it("defaults `now` to the current instant when omitted", () => {
    const result = todayInTimeZone("UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to America/New_York for an unresolvable timezone string", () => {
    const instant = new Date("2026-07-12T01:16:00Z");
    expect(todayInTimeZone("Not/AZone", instant)).toBe("2026-07-11");
  });
});

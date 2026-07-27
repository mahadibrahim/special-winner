import { describe, it, expect } from "vitest";
import { dateInTimeZone } from "@/lib/time/format-date";

describe("dateInTimeZone", () => {
  // 2026-07-26T01:30:00Z = 9:30pm July 25 in New York (EDT, UTC-4).
  const lateEveningEastern = new Date("2026-07-26T01:30:00Z");

  it("returns the wall-clock date for the timezone, not the UTC date", () => {
    expect(dateInTimeZone("America/New_York", lateEveningEastern)).toBe("2026-07-25");
  });

  it("matches the UTC date when the timezone is UTC", () => {
    expect(dateInTimeZone("UTC", lateEveningEastern)).toBe("2026-07-26");
  });

  it("formats as YYYY-MM-DD with zero padding", () => {
    const early = new Date("2026-01-05T12:00:00Z");
    expect(dateInTimeZone("America/New_York", early)).toBe("2026-01-05");
  });

  it("defaults to now when no date is passed", () => {
    expect(dateInTimeZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

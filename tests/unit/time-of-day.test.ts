import { describe, it, expect } from "vitest";
import { toTimeInputValue, TIME_OF_DAY_PATTERN } from "@/lib/time/time-of-day";

describe("toTimeInputValue", () => {
  // The bug: Postgres `time` columns round-trip as "HH:MM:SS", but an
  // <input type="time"> (and the season validator) expect "HH:MM". Loading
  // a saved season's time straight into the form left "16:00:00" in state,
  // which the server rejected with "Use HH:MM" — blocking every edit/publish.
  it("strips seconds from a stored HH:MM:SS time", () => {
    expect(toTimeInputValue("16:00:00")).toBe("16:00");
    expect(toTimeInputValue("09:30:00")).toBe("09:30");
  });

  it("passes through an already-clean HH:MM time", () => {
    expect(toTimeInputValue("09:00")).toBe("09:00");
  });

  it("returns empty string for null/undefined/empty (no time set)", () => {
    expect(toTimeInputValue(null)).toBe("");
    expect(toTimeInputValue(undefined)).toBe("");
    expect(toTimeInputValue("")).toBe("");
  });
});

describe("TIME_OF_DAY_PATTERN", () => {
  // Server-side defense-in-depth: accept both the clean "HH:MM" the form now
  // sends and the "HH:MM:SS" the DB round-trips, so a re-save never 400s.
  it("accepts HH:MM and HH:MM:SS", () => {
    expect(TIME_OF_DAY_PATTERN.test("09:00")).toBe(true);
    expect(TIME_OF_DAY_PATTERN.test("16:00:00")).toBe(true);
  });

  it("rejects malformed times", () => {
    expect(TIME_OF_DAY_PATTERN.test("9:00")).toBe(false);
    expect(TIME_OF_DAY_PATTERN.test("16:0")).toBe(false);
    expect(TIME_OF_DAY_PATTERN.test("noon")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { isKnownDob, ADULT_SENTINEL_DOB } from "@/lib/person/dob";

describe("isKnownDob", () => {
  it("returns false for null", () => {
    expect(isKnownDob(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isKnownDob(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isKnownDob("")).toBe(false);
  });

  it("returns false for the walk-up sentinel (1900-01-01)", () => {
    expect(isKnownDob(ADULT_SENTINEL_DOB)).toBe(false);
    expect(isKnownDob("1900-01-01")).toBe(false);
  });

  it("returns true for a real birth date", () => {
    expect(isKnownDob("2010-05-15")).toBe(true);
  });

  it("returns true for any non-sentinel non-empty date string", () => {
    expect(isKnownDob("1985-03-22")).toBe(true);
    expect(isKnownDob("2000-01-01")).toBe(true); // not the sentinel year
  });
});

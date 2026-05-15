import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("strips all non-digits", () => {
    expect(normalizePhone("(555) 555-0182")).toBe("5555550182");
  });
  it("drops a leading 1 country code", () => {
    expect(normalizePhone("+1 (555) 555-0182")).toBe("5555550182");
    expect(normalizePhone("1-555-555-0182")).toBe("5555550182");
  });
  it("keeps numbers that are already 10 digits", () => {
    expect(normalizePhone("5555550182")).toBe("5555550182");
  });
  it("returns the empty string for empty/null/garbage", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("not a phone")).toBe("");
  });
  it("returns the empty string when fewer than 10 digits remain", () => {
    expect(normalizePhone("555-0182")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats a 10-digit number as (NNN) NNN-NNNN", () => {
    expect(formatPhone("5555550182")).toBe("(555) 555-0182");
  });
  it("normalizes first, then formats", () => {
    expect(formatPhone("+1 555.555.0182")).toBe("(555) 555-0182");
  });
  it("falls back to the original when un-normalizable", () => {
    expect(formatPhone("not a phone")).toBe("not a phone");
  });
  it("falls back to empty for empty input", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});

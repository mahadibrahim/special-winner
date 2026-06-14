import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone, toE164 } from "@/lib/phone";

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

describe("toE164", () => {
  it("converts a stored 10-digit US number to +1 E.164", () => {
    expect(toE164("5555550182")).toBe("+15555550182");
  });
  it("normalizes formatting before converting", () => {
    expect(toE164("(555) 555-0182")).toBe("+15555550182");
  });
  it("treats an 11-digit leading-1 number as US", () => {
    expect(toE164("1-555-555-0182")).toBe("+15555550182");
    expect(toE164("+1 (555) 555-0182")).toBe("+15555550182");
  });
  it("preserves an already-international number that isn't US-10-digit", () => {
    // UK mobile: 11 digits, does not start with 1 → kept verbatim as E.164.
    expect(toE164("+44 7911 123456")).toBe("+447911123456");
    expect(toE164("00447911123456")).toBe("+447911123456");
  });
  it("honors an explicit default country code for a 10-digit local number", () => {
    expect(toE164("7911123456", "44")).toBe("+447911123456");
  });
  it("returns null for empty/null/garbage", () => {
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164("not a phone")).toBeNull();
  });
  it("returns null for too-short fragments", () => {
    expect(toE164("555-0182")).toBeNull();
  });
});

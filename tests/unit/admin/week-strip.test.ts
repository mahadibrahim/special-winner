import { describe, it, expect } from "vitest";
import {
  weekStrip,
  isToday,
  formatStripDate,
  parseStripDate,
} from "@/lib/admin/week-strip";

describe("weekStrip", () => {
  it("returns 7 days starting from the Sunday on or before the anchor", () => {
    const days = weekStrip(new Date("2026-05-19T12:00:00Z")); // Tuesday
    expect(days.length).toBe(7);
    expect(days[0].toISOString().slice(0, 10)).toBe("2026-05-17"); // Sunday
    expect(days[6].toISOString().slice(0, 10)).toBe("2026-05-23"); // Saturday
  });

  it("anchors on the same day if it's already a Sunday", () => {
    const days = weekStrip(new Date("2026-05-17T12:00:00Z"));
    expect(days[0].toISOString().slice(0, 10)).toBe("2026-05-17");
    expect(days[6].toISOString().slice(0, 10)).toBe("2026-05-23");
  });

  it("crosses month boundaries cleanly", () => {
    const days = weekStrip(new Date("2026-05-31T12:00:00Z")); // Sunday
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
    ]);
  });
});

describe("isToday", () => {
  it("returns true for the same UTC date as the reference", () => {
    expect(
      isToday(new Date("2026-05-19T00:00:00Z"), new Date("2026-05-19T22:30:00Z")),
    ).toBe(true);
  });
  it("returns false for different dates", () => {
    expect(
      isToday(new Date("2026-05-19T23:59:59Z"), new Date("2026-05-20T00:00:01Z")),
    ).toBe(false);
  });
});

describe("formatStripDate", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(formatStripDate(new Date("2026-05-19T12:00:00Z"))).toBe("2026-05-19");
  });
  it("zero-pads single-digit months and days", () => {
    expect(formatStripDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });
});

describe("parseStripDate", () => {
  it("parses a valid YYYY-MM-DD to UTC midnight", () => {
    const d = parseStripDate("2026-05-19");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });
  it("returns null for malformed input", () => {
    expect(parseStripDate("2026/05/19")).toBeNull();
    expect(parseStripDate("not-a-date")).toBeNull();
    expect(parseStripDate("")).toBeNull();
  });
  it("returns null for impossible months/days that Date can't parse", () => {
    // The regex accepts these, but Date() rejects them as Invalid Date.
    expect(parseStripDate("2026-13-01")).toBeNull();
    expect(parseStripDate("2026-00-15")).toBeNull();
  });
});

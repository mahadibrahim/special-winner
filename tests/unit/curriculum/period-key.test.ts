import { describe, it, expect } from "vitest";
import {
  periodKeyFor,
  quarterKeyFor,
  monthsOfQuarter,
  previousPeriod,
} from "@/lib/curriculum/period-key";

describe("periodKeyFor", () => {
  it("formats a mid-year UTC date as YYYY-MM", () => {
    expect(periodKeyFor(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06");
  });

  it("pads single-digit months", () => {
    expect(periodKeyFor(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
  });

  it("buckets by the UTC calendar day, not local time", () => {
    // 11:30pm UTC on the last day of August is still August in UTC, even
    // though it would already be September 1 in timezones ahead of UTC.
    expect(periodKeyFor(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    // The literal first instant of the next UTC month rolls over.
    expect(periodKeyFor(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
  });

  it("handles a December date without rolling into next year", () => {
    expect(periodKeyFor(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("quarterKeyFor", () => {
  it("maps January-March to Q1", () => {
    expect(quarterKeyFor(new Date("2026-01-01T00:00:00Z"))).toBe("2026-Q1");
    expect(quarterKeyFor(new Date("2026-03-31T23:59:59Z"))).toBe("2026-Q1");
  });

  it("maps April-June to Q2", () => {
    expect(quarterKeyFor(new Date("2026-04-01T00:00:00Z"))).toBe("2026-Q2");
    expect(quarterKeyFor(new Date("2026-06-30T00:00:00Z"))).toBe("2026-Q2");
  });

  it("maps July-September to Q3", () => {
    expect(quarterKeyFor(new Date("2026-07-15T00:00:00Z"))).toBe("2026-Q3");
  });

  it("maps October-December to Q4", () => {
    expect(quarterKeyFor(new Date("2026-10-01T00:00:00Z"))).toBe("2026-Q4");
    expect(quarterKeyFor(new Date("2026-12-31T23:59:59Z"))).toBe("2026-Q4");
  });
});

describe("monthsOfQuarter", () => {
  it("returns the three monthly keys for a Q1 quarter", () => {
    expect(monthsOfQuarter("2026-Q1")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns the three monthly keys for a Q4 quarter (no year rollover within the quarter)", () => {
    expect(monthsOfQuarter("2026-Q4")).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("throws on a malformed quarter key", () => {
    expect(() => monthsOfQuarter("2026-Q5")).toThrow();
    expect(() => monthsOfQuarter("2026-01")).toThrow();
    expect(() => monthsOfQuarter("garbage")).toThrow();
  });
});

describe("previousPeriod", () => {
  it("steps back one month within the same year", () => {
    expect(previousPeriod("2026-06")).toBe("2026-05");
  });

  it("crosses the year boundary from January to the prior December", () => {
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });

  it("is the exact inverse of stepping forward across Q4->Q1", () => {
    // December of one year is the previous period of January of the next.
    expect(previousPeriod("2027-01")).toBe("2026-12");
  });

  it("throws on a malformed period key", () => {
    expect(() => previousPeriod("legacy:abc-123")).toThrow();
    expect(() => previousPeriod("2026-Q1")).toThrow();
    expect(() => previousPeriod("not-a-period")).toThrow();
  });
});

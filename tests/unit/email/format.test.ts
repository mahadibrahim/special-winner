import { describe, it, expect } from "vitest";
import { formatEmailDate, formatEmailDateTime } from "@/lib/email/format";

describe("formatEmailDate", () => {
  it("renders a date in Eastern time by default", () => {
    // 2026-06-06 (date-only) — should read June 6 in ET.
    expect(formatEmailDate("2026-06-06")).toBe("June 6, 2026");
  });

  it("accepts a Date object", () => {
    // 16:00 UTC is safely mid-day in Eastern (12:00 PM EDT) — no off-by-one risk.
    expect(formatEmailDate(new Date("2026-06-15T16:00:00Z"))).toBe("June 15, 2026");
  });
});

describe("formatEmailDateTime", () => {
  it("renders a UTC instant in Eastern time, not UTC", () => {
    // 2026-01-15T22:00:00Z === 5:00 PM EST.
    const out = formatEmailDateTime(new Date("2026-01-15T22:00:00Z"));
    expect(out).toContain("5:00");
    expect(out).toContain("PM");
    expect(out).toContain("January 15, 2026");
  });

  it("renders summer instants in EDT", () => {
    // 2026-07-15T22:00:00Z === 6:00 PM EDT.
    const out = formatEmailDateTime(new Date("2026-07-15T22:00:00Z"));
    expect(out).toContain("6:00");
    expect(out).toContain("PM");
  });
});

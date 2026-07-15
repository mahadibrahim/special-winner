import { describe, it, expect } from "vitest";
import { parseDateOnly, formatDateOnly, formatDaySchedule } from "@/lib/time/format-date";

describe("parseDateOnly", () => {
  // The bug: `new Date("2026-07-06")` parses as UTC midnight, which in any
  // timezone behind UTC (e.g. US Eastern) renders as the previous day —
  // "July 5". Parsing the date-only string at LOCAL noon keeps the calendar
  // day stable regardless of the viewer's timezone.
  it("keeps the calendar day for a date-only string (no UTC rollback)", () => {
    const d = parseDateOnly("2026-07-06");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July (0-indexed)
    expect(d.getDate()).toBe(6);
  });

  it("falls through to normal parsing for full timestamps", () => {
    const d = parseDateOnly("2026-07-06T15:30:00Z");
    expect(d.getTime()).toBe(new Date("2026-07-06T15:30:00Z").getTime());
  });
});

describe("formatDateOnly", () => {
  it("formats a date-only string as its own calendar day, not the day before", () => {
    expect(
      formatDateOnly("2026-07-06", { month: "short", day: "numeric", year: "numeric" }),
    ).toBe("Jul 6, 2026");
  });

  it("defaults to a month/day/year format", () => {
    expect(formatDateOnly("2026-07-06")).toBe("Jul 6, 2026");
  });

  it("supports a month/day-only format", () => {
    expect(formatDateOnly("2026-07-06", { month: "short", day: "numeric" })).toBe("Jul 6");
  });
});

describe("formatDaySchedule", () => {
  it("returns a plural day name with a collapsed time range", () => {
    // 18:00–20:00 both pm → single suffix
    expect(formatDaySchedule("thu", "18:00:00", "20:00:00")).toBe("Thursdays · 6–8pm");
  });

  it("keeps both suffixes when the range crosses am/pm", () => {
    expect(formatDaySchedule("sat", "09:00:00", "10:00:00")).toBe("Saturdays · 9–10am");
    expect(formatDaySchedule("sat", "11:00:00", "13:00:00")).toBe("Saturdays · 11am–1pm");
  });

  it("makes no 'nights' assumption (safe for daytime/youth programs)", () => {
    expect(formatDaySchedule("sat", "09:00:00", "10:00:00")).not.toContain("night");
  });

  it("returns just the day when times are missing", () => {
    expect(formatDaySchedule("mon", null, null)).toBe("Mondays");
  });

  it("returns empty string when no structured day is set (caller falls back)", () => {
    expect(formatDaySchedule(null, "18:00:00", "20:00:00")).toBe("");
    expect(formatDaySchedule("", null, null)).toBe("");
  });
});

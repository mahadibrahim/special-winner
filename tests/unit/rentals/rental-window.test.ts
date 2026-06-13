import { describe, it, expect } from "vitest";
import { formatRentalWindow } from "@/lib/rentals/messages/format";

describe("formatRentalWindow", () => {
  it("renders a date with a start–end time range in the given timezone", () => {
    const start = new Date("2026-06-20T22:00:00.000Z"); // 6:00 PM ET
    const end = new Date("2026-06-20T23:30:00.000Z"); // 7:30 PM ET
    const s = formatRentalWindow(start, end, "America/New_York");
    expect(s).toContain("Jun 20");
    expect(s).toContain("6:00");
    expect(s).toContain("7:30");
  });

  it("respects the timezone (UTC differs from ET)", () => {
    const start = new Date("2026-06-20T22:00:00.000Z");
    const end = new Date("2026-06-20T23:30:00.000Z");
    const utc = formatRentalWindow(start, end, "UTC");
    expect(utc).toContain("10:00"); // 22:00 UTC
    expect(utc).toContain("11:30");
  });

  it("falls back to a default timezone when none is given", () => {
    const start = new Date("2026-06-20T22:00:00.000Z");
    const end = new Date("2026-06-20T23:30:00.000Z");
    const s = formatRentalWindow(start, end, null);
    expect(s).toContain("6:00"); // America/New_York default
  });
});

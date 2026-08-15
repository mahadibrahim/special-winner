/**
 * Pure formatter for the per-session lines every block email carries.
 *
 * The DST case is the load-bearing one: a winter block crosses the November
 * fallback, and "Tue 8:00 PM" must print as 8:00 PM on both sides of it. Only
 * formatting each instant in the org zone gets that right - offset arithmetic
 * silently shifts half the block by an hour.
 */
import { describe, it, expect } from "vitest";
import { formatBlockScheduleLines } from "@/lib/rentals/blocks/messages";

const TZ = "America/New_York";

describe("formatBlockScheduleLines", () => {
  it("renders date · time range · venue on one line", () => {
    // Tue Jan 6 2043, 8:00-9:00 PM ET = 01:00-02:00 UTC on Jan 7.
    const lines = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-01-07T01:00:00.000Z"),
          endsAt: new Date("2043-01-07T02:00:00.000Z"),
          venueName: "Orange",
        },
      ],
      TZ,
    );
    expect(lines).toEqual(["Tue Jan 6 · 8:00–9:00 PM · Orange"]);
  });

  it("keeps the meridiem on both halves when the range crosses noon", () => {
    // 11:30 AM - 1:00 PM ET on a Saturday.
    const lines = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-01-10T16:30:00.000Z"),
          endsAt: new Date("2043-01-10T18:00:00.000Z"),
          venueName: "Blue",
        },
      ],
      TZ,
    );
    expect(lines[0]).toContain("11:30 AM–1:00 PM");
  });

  it("prints 8:00 PM on both sides of the November fallback", () => {
    // Tue Oct 27 2043 (EDT) and Tue Nov 10 2043 (EST) - same local wall clock,
    // one hour apart in UTC.
    const lines = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-10-28T00:00:00.000Z"),
          endsAt: new Date("2043-10-28T01:00:00.000Z"),
          venueName: "Orange",
        },
        {
          startsAt: new Date("2043-11-11T01:00:00.000Z"),
          endsAt: new Date("2043-11-11T02:00:00.000Z"),
          venueName: "Orange",
        },
      ],
      TZ,
    );
    expect(lines[0]).toContain("8:00–9:00 PM");
    expect(lines[1]).toContain("8:00–9:00 PM");
    expect(lines[0]).toContain("Oct 27");
    expect(lines[1]).toContain("Nov 10");
  });

  it("prints 8:00 PM on both sides of the March spring-forward", () => {
    // Tue Mar 3 2043 (EST) and Tue Mar 10 2043 (EDT).
    const lines = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-03-04T01:00:00.000Z"),
          endsAt: new Date("2043-03-04T02:00:00.000Z"),
          venueName: "Orange",
        },
        {
          startsAt: new Date("2043-03-11T00:00:00.000Z"),
          endsAt: new Date("2043-03-11T01:00:00.000Z"),
          venueName: "Orange",
        },
      ],
      TZ,
    );
    expect(lines[0]).toContain("8:00–9:00 PM");
    expect(lines[1]).toContain("8:00–9:00 PM");
  });

  it("formats in the supplied zone, not the runner's", () => {
    const [line] = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-01-07T01:00:00.000Z"),
          endsAt: new Date("2043-01-07T02:00:00.000Z"),
          venueName: "Yellow",
        },
      ],
      "America/Los_Angeles",
    );
    expect(line).toContain("5:00–6:00 PM");
    expect(line).toContain("Jan 6");
  });

  it("returns one line per session, in the order given", () => {
    const lines = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-01-07T01:00:00.000Z"),
          endsAt: new Date("2043-01-07T02:00:00.000Z"),
          venueName: "Orange",
        },
        {
          startsAt: new Date("2043-01-14T01:00:00.000Z"),
          endsAt: new Date("2043-01-14T02:00:00.000Z"),
          venueName: "Blue",
        },
      ],
      TZ,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Orange");
    expect(lines[1]).toContain("Blue");
  });

  it("has no comma after the weekday", () => {
    const [line] = formatBlockScheduleLines(
      [
        {
          startsAt: new Date("2043-01-07T01:00:00.000Z"),
          endsAt: new Date("2043-01-07T02:00:00.000Z"),
          venueName: "Orange",
        },
      ],
      TZ,
    );
    expect(line.startsWith("Tue Jan 6 ")).toBe(true);
  });
});

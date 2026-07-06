import { describe, it, expect } from "vitest";
import {
  generatePracticeDates,
  zonedDateTimeToUtc,
} from "@/lib/curriculum/sequence-instantiation";

// 2026 DST facts (America/New_York): spring forward Sun 2026-03-08 (EST→EDT),
// fall back Sun 2026-11-01 (EDT→EST). 2026-03-01 and 2026-10-25 are Sundays.

describe("zonedDateTimeToUtc", () => {
  it("converts an EST wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-01", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-01T14:00:00.000Z"); // UTC-5
  });

  it("converts an EDT wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-08", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z"); // UTC-4 (DST began 2am that morning)
  });
});

describe("generatePracticeDates", () => {
  const base = {
    startDate: "2026-03-01", // a Sunday
    weekday: 0, // Sunday
    timeOfDay: "09:00",
    timezone: "America/New_York",
  };

  it("keeps the local wall-clock time across a spring-forward DST boundary", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates({
      ...base,
      count: 3,
    });
    expect(truncatedBySeasonEnd).toBe(false);
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z", // EST, UTC-5
      "2026-03-08T13:00:00.000Z", // EDT, UTC-4 — naive +7*24h math would say 14:00Z
      "2026-03-15T13:00:00.000Z",
    ]);
  });

  it("keeps the local wall-clock time across a fall-back DST boundary", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-10-25", // a Sunday, still EDT
      count: 2,
    });
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-10-25T13:00:00.000Z", // EDT
      "2026-11-01T14:00:00.000Z", // EST — fell back that morning
    ]);
  });

  it("advances startDate forward to the requested weekday when they disagree", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-03-02", // a Monday
      weekday: 3, // Wednesday
      count: 1,
    });
    expect(dates[0].toISOString()).toBe("2026-03-04T14:00:00.000Z");
  });

  it("truncates when count asks for more weeks than the season has left", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 5 },
      "2026-03-10", // season ends before the 3rd Sunday
    );
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
    ]);
    expect(truncatedBySeasonEnd).toBe(true);
  });

  it("allows a practice ON the season end date (inclusive)", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 2 },
      "2026-03-08",
    );
    expect(dates).toHaveLength(2);
    expect(truncatedBySeasonEnd).toBe(false);
  });
});

// Regression coverage for issue #544: the admin Edit Season modal shifted
// registrationCloses and earlyBirdDeadline forward one day on EVERY save,
// because populate read the UTC calendar date while submit anchored end-of-day
// in the browser zone. The fix routes both directions through one timezone
// (the org default), making an untouched round-trip byte-identical.
import { describe, it, expect } from "vitest";
import {
  zonedEndOfDayUtcIso,
  zonedCalendarDate,
  ORG_DEFAULT_TIMEZONE,
} from "@/lib/time/zoned-day";

const ET = ORG_DEFAULT_TIMEZONE; // America/New_York

describe("zonedEndOfDayUtcIso", () => {
  it("EDT (summer): end of Oct 29 ET is 03:59:59Z on Oct 30", () => {
    expect(zonedEndOfDayUtcIso("2026-10-29", ET)).toBe("2026-10-30T03:59:59.000Z");
  });

  it("EST (winter): end of Dec 15 ET is 04:59:59Z on Dec 16", () => {
    expect(zonedEndOfDayUtcIso("2026-12-15", ET)).toBe("2026-12-16T04:59:59.000Z");
  });

  it("DST fall-back day (Nov 1 2026): end of day is already EST", () => {
    // 2am EDT Nov 1 2026 falls back to 1am EST — 23:59:59 that evening is
    // UTC-5, not UTC-4. The naive first-pass offset guess is wrong here;
    // the two-pass correction is what this pins.
    expect(zonedEndOfDayUtcIso("2026-11-01", ET)).toBe("2026-11-02T04:59:59.000Z");
  });

  it("DST spring-forward day (Mar 8 2026): end of day is already EDT", () => {
    expect(zonedEndOfDayUtcIso("2026-03-08", ET)).toBe("2026-03-09T03:59:59.000Z");
  });
});

describe("the #544 round-trip invariant", () => {
  // The exact prod repro from the issue: stored Oct 29 ET end-of-day
  // (2026-10-30T03:59:59Z) displayed as 10/30 and saved back as Oct 31Z.
  it("the issue's repro value round-trips byte-identical", () => {
    const stored = "2026-10-30T03:59:59.000Z";
    const displayed = zonedCalendarDate(stored, ET);
    expect(displayed).toBe("2026-10-29"); // the modal now shows the ET date
    expect(zonedEndOfDayUtcIso(displayed, ET)).toBe(stored);
  });

  it("the early-bird repro value round-trips byte-identical", () => {
    const stored = "2026-09-29T03:59:59.000Z"; // Sep 28 ET end-of-day
    const displayed = zonedCalendarDate(stored, ET);
    expect(displayed).toBe("2026-09-28");
    expect(zonedEndOfDayUtcIso(displayed, ET)).toBe(stored);
  });

  it("holds across a year of dates, both DST regimes", () => {
    for (let month = 0; month < 12; month++) {
      const date = `2026-${String(month + 1).padStart(2, "0")}-15`;
      const stored = zonedEndOfDayUtcIso(date, ET);
      expect(zonedCalendarDate(stored, ET)).toBe(date);
      expect(zonedEndOfDayUtcIso(zonedCalendarDate(stored, ET), ET)).toBe(stored);
    }
  });
});

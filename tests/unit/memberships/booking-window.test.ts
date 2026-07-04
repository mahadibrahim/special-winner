import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_WINDOW_DAYS,
  resolveBookingWindowDays,
  bookingWindowEndUtc,
} from "@/lib/memberships/booking-window";

describe("resolveBookingWindowDays", () => {
  it("returns the default for no membership", () => {
    expect(resolveBookingWindowDays(null)).toBe(DEFAULT_BOOKING_WINDOW_DAYS);
    expect(resolveBookingWindowDays(undefined)).toBe(DEFAULT_BOOKING_WINDOW_DAYS);
  });

  it("returns the default when benefits omit booking_window_days", () => {
    expect(resolveBookingWindowDays({ rental_discount_pct: 25 })).toBe(
      DEFAULT_BOOKING_WINDOW_DAYS,
    );
  });

  it("uses the tier's booking_window_days when set (prod Founder = 14)", () => {
    expect(resolveBookingWindowDays({ booking_window_days: 14 })).toBe(14);
  });

  it("ignores zero, negative, and non-integer values", () => {
    expect(resolveBookingWindowDays({ booking_window_days: 0 })).toBe(
      DEFAULT_BOOKING_WINDOW_DAYS,
    );
    expect(resolveBookingWindowDays({ booking_window_days: -3 })).toBe(
      DEFAULT_BOOKING_WINDOW_DAYS,
    );
    expect(resolveBookingWindowDays({ booking_window_days: 7.5 })).toBe(
      DEFAULT_BOOKING_WINDOW_DAYS,
    );
  });

  it("clamps a corrupt oversized value to the sanity ceiling", () => {
    expect(resolveBookingWindowDays({ booking_window_days: 9999 })).toBe(90);
  });
});

describe("bookingWindowEndUtc", () => {
  const TZ = "America/New_York";

  it("allows every slot through the end of the last in-window local day", () => {
    // Noon UTC July 4 = 8 AM EDT July 4. 7-day window → bookable through
    // July 11 local; boundary is July 12 00:00 EDT = July 12 04:00 UTC.
    const now = new Date("2026-07-04T12:00:00Z");
    const end = bookingWindowEndUtc(now, 7, TZ);
    expect(end.toISOString()).toBe("2026-07-12T04:00:00.000Z");

    const lateSlotOnLastDay = new Date("2026-07-12T03:00:00Z"); // Jul 11, 11 PM EDT
    const firstBeyond = new Date("2026-07-12T04:00:00Z"); // Jul 12, 12 AM EDT
    expect(lateSlotOnLastDay < end).toBe(true);
    expect(firstBeyond < end).toBe(false);
  });

  it("anchors to the org-local calendar day, not the UTC day", () => {
    // 2 AM UTC July 5 is still 10 PM EDT July 4 — the window must count
    // from July 4 local, so the boundary stays July 12 00:00 EDT.
    const lateEveningLocal = new Date("2026-07-05T02:00:00Z");
    const end = bookingWindowEndUtc(lateEveningLocal, 7, TZ);
    expect(end.toISOString()).toBe("2026-07-12T04:00:00.000Z");
  });

  it("extends with a larger window (Founder = 14)", () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const end = bookingWindowEndUtc(now, 14, TZ);
    expect(end.toISOString()).toBe("2026-07-19T04:00:00.000Z");
  });
});

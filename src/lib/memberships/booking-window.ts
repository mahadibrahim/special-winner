/**
 * Advance-booking window for field rentals.
 *
 * Product rule (2026-07-04): everyone can book online up to
 * DEFAULT_BOOKING_WINDOW_DAYS ahead; a membership tier may extend that via
 * `benefits.booking_window_days` (prod Founder = 14). Anything further out is
 * a contact-the-venue conversation, and venue staff can always create it via
 * the admin path, which is not window-limited.
 *
 * Pure functions — unit-tested, no DB access. Mirrors the style of
 * `discount.ts`.
 */
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day";
import type { MemberBenefits } from "@/lib/memberships/discount";

export const DEFAULT_BOOKING_WINDOW_DAYS = 7;

/** Sanity ceiling — a corrupt/typo'd benefits blob must not open the calendar years out. */
const MAX_BOOKING_WINDOW_DAYS = 90;

export function resolveBookingWindowDays(
  benefits: MemberBenefits | null | undefined,
): number {
  const days = benefits?.booking_window_days;
  if (typeof days === "number" && Number.isInteger(days) && days > 0) {
    return Math.min(days, MAX_BOOKING_WINDOW_DAYS);
  }
  return DEFAULT_BOOKING_WINDOW_DAYS;
}

/**
 * First UTC instant that is BEYOND the booking window: local midnight at the
 * start of (today + windowDays + 1) in the org's timezone. A slot is
 * bookable iff `startsAt < bookingWindowEndUtc(...)` — i.e. the window is
 * day-based and inclusive, so with a 7-day window on July 4 every slot
 * through the end of July 11 (org-local) is allowed.
 */
export function bookingWindowEndUtc(
  now: Date,
  windowDays: number,
  timeZone: string,
): Date {
  // Org-local calendar date of `now` (en-CA formats as YYYY-MM-DD).
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const [y, m, d] = todayLocal.split("-").map(Number);
  const boundary = new Date(Date.UTC(y, m - 1, d + windowDays + 1));
  return zonedHourToUtc(boundary.toISOString().slice(0, 10), 0, timeZone);
}

import { tzDayBoundsUtc } from "@/lib/activity-tracking/tz-day";

/**
 * Resolve the UTC instants that bound a payroll period given as two
 * YYYY-MM-DD calendar dates in the org's timezone.
 *
 * Each boundary is resolved independently via `tzDayBoundsUtc` — the
 * period start is the start-of-day bound for `fromDate` and the period
 * end is the end-of-day bound for `toDate`. This is deliberate rather
 * than "start of fromDate + N days": resolving each boundary from its
 * own calendar date is correct across a DST transition that falls
 * *inside* the period (e.g. a pay period spanning the March
 * spring-forward), whereas naive day-count arithmetic on a single
 * instant would drift by an hour once the offset changes mid-period.
 *
 * Throws if `toDate` is before `fromDate` — an inverted range is a
 * caller bug (bad query params), not a valid empty period.
 */
export function resolvePayPeriodBoundsUtc(
  fromDate: string,
  toDate: string,
  tz: string,
): { startUtc: Date; endUtc: Date } {
  if (toDate < fromDate) {
    throw new Error(
      `resolvePayPeriodBoundsUtc: 'to' (${toDate}) is before 'from' (${fromDate})`,
    );
  }

  const { startUtc } = tzDayBoundsUtc(fromDate, tz);
  const { endUtc } = tzDayBoundsUtc(toDate, tz);

  return { startUtc, endUtc };
}

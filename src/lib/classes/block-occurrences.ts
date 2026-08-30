/**
 * Block (fixed-length term) occurrence math — the session COUNT that both the
 * catalog quote and the purchase price are derived from.
 *
 * A `class_blocks` row is a civil-date window ([startDate, endDate], org
 * timezone) over a standing weekly slot (`classSlotTemplates.weekday` +
 * `.startTime`). "How many sessions does this block contain?" is therefore
 * "how many times does that weekday/wall-clock land inside the window?" — and
 * the same question with `after = now` instead of the block's eve answers
 * "how many sessions are LEFT?", which is exactly mid-block proration. One
 * function serves both; the only difference is the `after` cutoff.
 *
 * The math is deliberately delegated to `occurrenceInstants` in
 * ./materialize.ts rather than reimplemented: that function already walks
 * civil days (not week-milliseconds) and resolves each wall clock through
 * `Intl` in the org zone, so a block that straddles a DST transition yields
 * the right instants on both sides of it — a block priced with naive
 * `+7*86_400_000` arithmetic would silently gain or lose an hour across the
 * November fall-back and could mis-count an edge occurrence.
 *
 * `occurrenceInstants` takes INSTANT bounds (`now`, `horizonEnd`) with
 * `> now && <= horizonEnd` semantics, while a block's bounds are CIVIL DATES
 * that are inclusive on both ends. The translation:
 *   - lower bound: the instant 1ms before local midnight of `startDate`, so
 *     an occurrence ON `startDate` is included — then clamped forward to
 *     `after` when the caller is prorating.
 *   - upper bound: `blockExpiryInstant(endDate)` = 23:59:59 local on
 *     `endDate`, so an occurrence ON `endDate` is included.
 */
import { occurrenceInstants, zonedWallClockUtc } from "./materialize";

/** Parse a Postgres `date` string ("YYYY-MM-DD") into civil parts. */
function parseCivilDate(isoDate: string): { y: number; m: number; day: number } {
  const [y, m, day] = isoDate.split("-");
  return { y: Number(y), m: Number(m), day: Number(day) };
}

/**
 * The grant-expiry instant for a block: end-of-day (23:59:59 wall clock) on
 * the block's `endDate` in the org timezone.
 *
 * Credits bought for a block are pinned to that block's window — the seat is
 * held through the last session and no further, so `class_credit_grants.expiresAt`
 * is set to this instant and the materialize cron's pass 0 ends the enrollment
 * once it passes. Using end-of-day (rather than the last session's start)
 * keeps a same-day make-up or a late cron run from expiring a grant while its
 * final session is still in progress.
 */
export function blockExpiryInstant(endDate: string, timeZone: string): Date {
  return zonedWallClockUtc(parseCivilDate(endDate), 23, 59, 59, timeZone);
}

/**
 * Every UTC instant at which `weekday`/`startTime` (wall clock, `timeZone`)
 * occurs inside the block's civil-date window [`startDate`, `endDate`]
 * (inclusive, org tz) AND strictly after `after`.
 *
 * Two call shapes:
 *  - full-price display — pass an `after` at or before the block's start
 *    (anything earlier than local midnight of `startDate` works); every
 *    occurrence in the window is returned.
 *  - mid-block proration — pass `after = now`; only the sessions the family
 *    can still attend are returned, and the price follows the count.
 *
 * Returns `[]` (rather than throwing) when `after` is past the window's end.
 */
export function blockOccurrenceInstants(opts: {
  weekday: number;
  startTime: string; // "HH:MM:SS"
  timeZone: string;
  startDate: string; // "YYYY-MM-DD" (classBlocks.startDate)
  endDate: string; // "YYYY-MM-DD"
  after: Date;
}): Date[] {
  const { weekday, startTime, timeZone, startDate, endDate, after } = opts;

  // 1ms before local midnight of startDate — `occurrenceInstants` is
  // exclusive on its lower bound, so this makes an occurrence ON startDate
  // qualify. Clamped forward to `after` for the proration call shape.
  const windowStart = zonedWallClockUtc(parseCivilDate(startDate), 0, 0, 0, timeZone);
  const lowerBound = new Date(Math.max(after.getTime(), windowStart.getTime() - 1));
  const windowEnd = blockExpiryInstant(endDate, timeZone);

  return occurrenceInstants(weekday, startTime, timeZone, lowerBound, windowEnd);
}

/**
 * "Today" as `YYYY-MM-DD`, resolved in a given IANA timezone.
 *
 * `formatStripDate(new Date())` (src/lib/admin/week-strip.ts) answers "what
 * UTC calendar day is it" — correct for the strip's own day-math, but wrong
 * for "what day is it right now for the desk staff standing in this venue".
 * Those two disagree for a chunk of every day in every US timezone: at
 * 9:16 PM America/New_York on a Saturday it's already 1:16 AM UTC Sunday,
 * so a UTC-derived "today" hands evening front-desk staff an empty board for
 * a day that hasn't started yet (see the 2026-07-11 21:16 ET live-smoke
 * catch on /admin/venue).
 *
 * Accepts an optional `now` so callers/tests can pin a known instant instead
 * of depending on the wall clock.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

  try {
    return format(timeZone);
  } catch {
    // Unresolvable/garbage IANA zone (e.g. a corrupted org/location setting)
    // — fall back to a known-good zone rather than throwing and breaking
    // the whole page.
    return format("America/New_York");
  }
}

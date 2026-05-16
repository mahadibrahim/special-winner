/**
 * Date helpers for the Venue Day week strip + URL routing.
 *
 * All math is UTC-based: the Venue Day URL is keyed on `YYYY-MM-DD`,
 * which is a calendar-day identifier, not a wall-clock moment. Using
 * UTC throughout avoids "the day shifts by an hour at DST" surprises.
 */

/**
 * Given an anchor date, returns the 7 days of the week that contains it,
 * starting on Sunday. If the anchor is already a Sunday, it's the first
 * element of the result.
 */
export function weekStrip(anchor: Date): Date[] {
  const sunday = new Date(anchor);
  sunday.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = sunday.getUTCDay(); // 0 = Sunday
  sunday.setUTCDate(sunday.getUTCDate() - dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setUTCDate(sunday.getUTCDate() + i);
    return d;
  });
}

/** True when `date` and `reference` fall on the same UTC calendar day. */
export function isToday(date: Date, reference: Date = new Date()): boolean {
  return (
    date.getUTCFullYear() === reference.getUTCFullYear() &&
    date.getUTCMonth() === reference.getUTCMonth() &&
    date.getUTCDate() === reference.getUTCDate()
  );
}

/** Formats a Date as `YYYY-MM-DD` in UTC. */
export function formatStripDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses `YYYY-MM-DD` to a UTC midnight Date, or returns null on malformed input. */
export function parseStripDate(yyyyMmDd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

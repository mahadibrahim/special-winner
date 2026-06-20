/**
 * Safe formatting for date-only values (Postgres `date` columns, which arrive
 * as "YYYY-MM-DD" strings).
 *
 * `new Date("2026-07-06")` parses as UTC midnight; formatting that in a
 * timezone behind UTC (e.g. US Eastern) renders the previous day — "July 5".
 * Parsing the date-only string at LOCAL noon keeps the calendar day stable for
 * every viewer. Full timestamps (with a time component) are passed through to
 * the normal `Date` parser, so this is safe to use on mixed inputs.
 *
 * Use this for `seasons.startDate` / `endDate` and any other `date` column.
 * Do NOT route real `timestamptz` values (e.g. registrationCloses) through the
 * date-only branch — they carry a meaningful instant and parse correctly as-is.
 */
export function parseDateOnly(value: string | Date): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  return typeof value === "string" ? new Date(value) : value;
}

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/** Format a date-only value for display without the UTC off-by-one. */
export function formatDateOnly(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
): string {
  return parseDateOnly(value).toLocaleDateString("en-US", opts);
}

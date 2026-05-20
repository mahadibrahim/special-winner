/**
 * Date formatting for transactional emails. All emails render in the
 * organization's local timezone — never the server's (Netlify runs UTC).
 * Aspire Sports operates in Columbus, Ohio, so the default is US Eastern.
 */
const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Parse a date value for formatting. Date-only ISO strings (YYYY-MM-DD) are
 * treated as local calendar dates, not UTC midnight, to avoid the common
 * off-by-one-day issue where "2026-06-06" renders as June 5 in ET.
 */
function parseDate(date: Date | string): Date {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    // Use noon local time so any timezone offset won't flip the calendar date.
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  return typeof date === "string" ? new Date(date) : date;
}

/** Format a date as e.g. "June 6, 2026". */
export function formatEmailDate(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const d = parseDate(date);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Format a date+time as e.g. "January 15, 2026, 5:00 PM EST". */
export function formatEmailDateTime(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const d = parseDate(date);
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

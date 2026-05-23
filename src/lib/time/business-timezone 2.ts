/**
 * The timezone Aspire Sports operates in.
 *
 * Server code — Astro page frontmatter, API routes — runs in UTC on Netlify.
 * Any "today" or wall-clock display computed there with a bare `new Date()`
 * rolls the calendar day over a day early every evening local time (e.g. a
 * 9 PM Thursday in Ohio is already Friday in UTC). Format against this zone,
 * or pass an explicit `timeZone` to `toLocale*` calls, to avoid that.
 *
 * Aspire is a single-market operator (Columbus, Ohio). If the business ever
 * spans timezones, switch the relevant call site to the location's own
 * `timezone` column instead of this constant.
 */
export const BUSINESS_TIMEZONE = "America/New_York";

/** The current hour (0–23) in the business timezone. */
export function currentBusinessHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

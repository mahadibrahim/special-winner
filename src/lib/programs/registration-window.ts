/**
 * Registration-close semantics for seasons ("live until", 2026-07-04).
 *
 * A season in status `open` stops being registerable when:
 *   - `registration_closes` is set and that instant has passed, or
 *   - `registration_closes` is unset and the season's start DAY has passed
 *     (the start day itself stays open — same rule the SoccerOne /leagues
 *     page applies).
 *
 * Admins extend or shorten the window by setting `registration_closes`;
 * setting it after `start_date` deliberately allows late joins. Admin-side
 * creation paths (walk-up, admin rentals) do not consult this — staff can
 * always register people manually.
 *
 * Pure function; the SQL twin of this predicate lives in
 * src/pages/api/public/seasons.ts (list visibility). Keep the two in sync.
 */

export interface SeasonRegistrationWindow {
  /** timestamp column — Date from drizzle, string once serialized */
  registrationCloses: Date | string | null;
  /** date column — "YYYY-MM-DD" from drizzle, Date tolerated */
  startDate: Date | string | null;
}

export function isRegistrationClosed(
  season: SeasonRegistrationWindow,
  now: Date = new Date(),
): boolean {
  if (season.registrationCloses) {
    return now.getTime() >= new Date(season.registrationCloses).getTime();
  }
  if (season.startDate) {
    const startDay =
      season.startDate instanceof Date
        ? season.startDate.toISOString().slice(0, 10)
        : String(season.startDate).slice(0, 10);
    return now.toISOString().slice(0, 10) > startDay;
  }
  return false;
}

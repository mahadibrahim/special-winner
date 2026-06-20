/**
 * Normalize a stored time-of-day to the "HH:MM" value an `<input type="time">`
 * (and the season validator) expect.
 *
 * Postgres `time` columns serialize back as "HH:MM:SS" (e.g. "16:00:00").
 * Loading that straight into a time input leaves the seconds in form state,
 * and the season schema's `/^\d{2}:\d{2}$/` rejects it on save — which blocked
 * editing or publishing any season that had times set. Trimming to the first
 * "HH:MM" keeps the input and the validator in agreement.
 *
 * Returns "" for null/undefined/empty so callers can assign straight into a
 * controlled input's value.
 */
export function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : "";
}

/**
 * Validation pattern for a submitted time-of-day. Accepts the clean "HH:MM"
 * the form sends and the "HH:MM:SS" Postgres round-trips, so re-saving a season
 * that already has times set never fails validation. Used by the season schema.
 */
export const TIME_OF_DAY_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

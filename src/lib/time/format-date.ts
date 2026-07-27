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

// dayOfWeek is stored lowercase 3-char ('mon'..'sun'); render it as a plural day
// name ("Thursdays") so it reads naturally on browse cards.
const DAY_PLURAL: Record<string, string> = {
  sun: "Sundays", mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays",
  thu: "Thursdays", fri: "Fridays", sat: "Saturdays",
};

// startTime/endTime are Postgres `time` columns → "HH:MM:SS" strings.
function timeTo12h(t: string): string {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

/**
 * Bare time window, e.g. "6–11pm" or "11am–1pm" — collapses matching am/pm
 * periods to a single suffix. Returns "" when either bound is missing.
 * Used standalone on cards when a season has times but no structured play day.
 */
export function formatTimeWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return "";
  const s = timeTo12h(start), e = timeTo12h(end);
  const sNum = s.replace(/[ap]m/, ""), sPer = s.slice(-2), ePer = e.slice(-2);
  return sPer === ePer ? `${sNum}–${e}` : `${s}–${e}`;
}

/**
 * Neutral day/time label for browse cards, e.g. "Thursdays" or
 * "Saturdays · 9–10am". Unlike the league rail's `formatDayTime`, this makes no
 * "nights" assumption, so it's safe for daytime/youth programs too. Returns ""
 * when no structured day is set — callers fall back to `scheduleNotes`.
 */
export function formatDaySchedule(
  day: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const label = DAY_PLURAL[(day ?? "").toLowerCase()];
  if (!label) return "";
  const window = formatTimeWindow(start, end);
  return window ? `${label} · ${window}` : label;
}

/**
 * Calendar date ("YYYY-MM-DD") for an instant in an IANA timezone.
 *
 * Use this instead of `new Date().toISOString().slice(0, 10)` whenever
 * "today" means the facility's day, not UTC's: after 8pm Eastern the UTC
 * date has already rolled over, so a UTC "today" as a date-picker min/default
 * blocks booking the current evening. Deterministic for a given instant on
 * server and client alike, so it's safe in hydrated first renders.
 */
export function dateInTimeZone(timeZone: string, date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

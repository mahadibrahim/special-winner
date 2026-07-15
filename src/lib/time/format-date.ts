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
  if (!start || !end) return label;
  // "9–10am" — collapse matching am/pm periods to a single suffix.
  const s = timeTo12h(start), e = timeTo12h(end);
  const sNum = s.replace(/[ap]m/, ""), sPer = s.slice(-2), ePer = e.slice(-2);
  return sPer === ePer ? `${label} · ${sNum}–${e}` : `${label} · ${s}–${e}`;
}

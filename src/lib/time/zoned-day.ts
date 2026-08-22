import { dateInTimeZone } from "@/lib/time/format-date";

/**
 * Symmetric calendar-day ⇄ instant conversion in a fixed IANA timezone.
 *
 * Built for the admin season form's deadline fields (registrationCloses,
 * earlyBirdDeadline), which store "end of day X, org-local" as a UTC
 * timestamptz. The form's date inputs must round-trip that instant through a
 * bare "YYYY-MM-DD" without drifting: issue #544 was the asymmetric pair
 * (populate from the UTC calendar date, save as end-of-day in the admin's
 * browser zone) shifting both deadlines forward one day on every save.
 *
 * Read direction: use `dateInTimeZone(tz, instant)` (format-date.ts).
 * Write direction: `zonedEndOfDayUtcIso` below.
 * Invariant (regression-tested): for any stored end-of-day-in-tz instant,
 *   zonedEndOfDayUtcIso(dateInTimeZone(tz, d), tz) === d.toISOString()
 */

/** The org-schema default (organizations.timezone). Admin surfaces that have
 *  no per-org timezone in their payload anchor to this — a deliberate
 *  single-tenant simplification; thread the real org value through when a
 *  second-timezone tenant exists. */
export const ORG_DEFAULT_TIMEZONE = "America/New_York";

/** Offset (ms) of `timeZone` from UTC at `instant` — positive east of UTC. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // "24" can appear for midnight under hour12:false in some ICU versions.
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * The instant "23:59:59 on `dateStr` in `timeZone`", as a UTC ISO string.
 *
 * Two-pass offset lookup handles DST: the first guess uses the offset at the
 * naive-UTC reading of the date, the second corrects when the wall-clock day
 * in question sits on the other side of a transition.
 */
export function zonedEndOfDayUtcIso(dateStr: string, timeZone: string): string {
  const naive = new Date(`${dateStr}T23:59:59Z`);
  const first = tzOffsetMs(naive, timeZone);
  let result = new Date(naive.getTime() - first);
  const second = tzOffsetMs(result, timeZone);
  if (second !== first) result = new Date(naive.getTime() - second);
  return result.toISOString();
}

/**
 * Calendar date ("YYYY-MM-DD") of a stored deadline instant in `timeZone` —
 * the read half of the round-trip, for populating `<input type="date">`.
 * Thin wrapper so both halves import from one module.
 */
export function zonedCalendarDate(instantIso: string, timeZone: string): string {
  return dateInTimeZone(timeZone, new Date(instantIso));
}

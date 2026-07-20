/**
 * Week bucketing for the admin pickup schedule.
 *
 * All returns are UTC instants; "day" boundaries (Monday start, per-day
 * buckets) are computed as civil dates in the org's IANA timezone, so the
 * result is correct across DST transitions.
 */

interface CivilDate {
  y: number;
  m: number; // 1-12
  day: number;
}

interface CivilDateWithWeekday extends CivilDate {
  weekday: number; // 0 = Monday .. 6 = Sunday
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Civil date (and Mon-start weekday index) of `d` as observed in `timeZone`. */
function tzParts(d: Date, timeZone: string): CivilDateWithWeekday {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/**
 * Add `delta` calendar days to a civil date using pure calendar arithmetic
 * (via a UTC-anchored Date, whose overflow normalization handles
 * month/year rollovers). This never touches wall-clock time, so it can't be
 * thrown off by DST — unlike subtracting `delta * 24h` in milliseconds from
 * a real instant, which drifts by an hour across a DST transition.
 */
function civilAddDays(civ: CivilDate, delta: number): CivilDate {
  const d = new Date(Date.UTC(civ.y, civ.m - 1, civ.day + delta));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** UTC instant of local midnight (00:00) in `timeZone` on the given civil date. */
function zonedMidnightUtc(civ: CivilDate, timeZone: string): Date {
  // Guess noon UTC, then correct by the formatted offset. Converges in at
  // most a couple iterations and is exact for all real-world zones/DST
  // rules (offsets are always well under 24h).
  let guess = new Date(Date.UTC(civ.y, civ.m - 1, civ.day, 12));
  const targetMidnightUtcMs = Date.UTC(civ.y, civ.m - 1, civ.day, 0, 0);
  for (let i = 0; i < 3; i++) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
    const observedMs = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
    );
    const deltaMin = (observedMs - targetMidnightUtcMs) / 60000;
    if (deltaMin === 0) return guess;
    guess = new Date(guess.getTime() - deltaMin * 60000);
  }
  return guess;
}

function dayKeyOf(civ: CivilDate): string {
  return `${civ.y}-${String(civ.m).padStart(2, "0")}-${String(civ.day).padStart(2, "0")}`;
}

const WEEKDAY_LABEL_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const MONTH_DAY_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** "SAT Jul 25" for the given civil date. Uses a UTC-noon anchor so the
 *  label never depends on org-timezone rendering near a midnight edge. */
function labelOf(civ: CivilDate): string {
  const anchor = new Date(Date.UTC(civ.y, civ.m - 1, civ.day, 12));
  return `${WEEKDAY_LABEL_FMT.format(anchor).toUpperCase()} ${MONTH_DAY_LABEL_FMT.format(anchor)}`;
}

export function addWeeks(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 7 * 24 * 60 * 60 * 1000);
}

/** The Monday 00:00 -> next Monday 00:00 window (in `timezone`) containing `anchor`. */
export function weekBoundsFor(anchor: Date, timezone: string): { from: Date; to: Date } {
  const { y, m, day, weekday } = tzParts(anchor, timezone);
  const monday = civilAddDays({ y, m, day }, -weekday);
  const nextMonday = civilAddDays(monday, 7);
  return {
    from: zonedMidnightUtc(monday, timezone),
    to: zonedMidnightUtc(nextMonday, timezone),
  };
}

export function groupByDay<T extends { startsAt: string }>(
  sessions: T[],
  timezone: string,
  anchor?: Date,
): { dayKey: string; label: string; sessions: T[] }[] {
  const effectiveAnchor =
    anchor ?? (sessions.length ? new Date(sessions[0].startsAt) : new Date());
  const { from } = weekBoundsFor(effectiveAnchor, timezone);
  const monday = tzParts(from, timezone); // `from` is exact local midnight, so its civil date is unambiguous

  const days: { dayKey: string; label: string; sessions: T[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const civ = civilAddDays(monday, i);
    days.push({ dayKey: dayKeyOf(civ), label: labelOf(civ), sessions: [] });
  }
  const byKey = new Map(days.map((d) => [d.dayKey, d]));

  for (const s of sessions) {
    const civ = tzParts(new Date(s.startsAt), timezone);
    byKey.get(dayKeyOf(civ))?.sessions.push(s);
  }

  return days;
}

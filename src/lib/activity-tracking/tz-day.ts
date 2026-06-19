/**
 * Compute the UTC instants that bound a calendar day in a target timezone.
 *
 * Why: dashboard queries like "today's activities" should mean "today
 * in the org's local timezone," not "today in UTC." End-of-day
 * activities at 21:00 local roll past midnight UTC for Eastern-time
 * orgs and would otherwise drop off the wrong calendar day.
 */

function computeTzOffsetMs(at: Date, tz: string): number {
  // Returns ms such that: utcInstant = localWallClock - offset.
  // formatToParts has no millisecond field, so we align the reference
  // instant to a whole second before computing — otherwise sub-second
  // input bleeds into the offset and the bound shifts by up to ~1s.
  const alignedMs = Math.floor(at.getTime() / 1000) * 1000;
  const aligned = new Date(alignedMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(aligned).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const hourRaw = parseInt(parts.hour, 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const localTimestamp = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  return localTimestamp - alignedMs;
}

/**
 * UTC instant for `hour:00` local wall-clock on `date` (YYYY-MM-DD) in `tz`.
 * Inverse of resolving a UTC instant's local hour. Whole-hour only.
 */
export function zonedHourToUtc(date: string, hour: number, tz: string): Date {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`zonedHourToUtc: invalid date '${date}', expected YYYY-MM-DD`)
  const [, y, mo, d] = m
  // Wall-clock as-if-UTC, then subtract the tz offset at that instant.
  const asUtc = new Date(`${y}-${mo}-${d}T${String(hour).padStart(2, "0")}:00:00.000Z`)
  return new Date(asUtc.getTime() - computeTzOffsetMs(asUtc, tz))
}

/**
 * Given a YYYY-MM-DD calendar date and IANA tz, return the UTC bounds
 * of that local day: 00:00:00.000 → 23:59:59.999 wall-clock in tz.
 */
export function tzDayBoundsUtc(date: string, tz: string): { startUtc: Date; endUtc: Date } {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`tzDayBoundsUtc: invalid date '${date}', expected YYYY-MM-DD`);
  const [, y, m, d] = match;

  // Construct as if the wall-clock time were UTC; then subtract the tz
  // offset at that instant to get the actual UTC time.
  const startAsUtc = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  const endAsUtc = new Date(`${y}-${m}-${d}T23:59:59.999Z`);

  const startUtc = new Date(startAsUtc.getTime() - computeTzOffsetMs(startAsUtc, tz));
  const endUtc = new Date(endAsUtc.getTime() - computeTzOffsetMs(endAsUtc, tz));

  return { startUtc, endUtc };
}

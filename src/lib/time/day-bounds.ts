/**
 * UTC instants bounding the *local* calendar day at a facility.
 *
 * The kiosk endpoints previously used UTC day bounds. After 8pm Eastern
 * the UTC date has already rolled over, so "today" silently excluded the
 * evening sessions that were actually in progress — the busiest block.
 * Every kiosk query for "today" must go through this helper.
 */
const FALLBACK_TZ = "America/New_York";

/** Wall-clock Y/M/D at `instant` as observed in `tz`. */
function localYmd(tz: string, instant: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Offset in ms that `tz` is ahead of UTC at `instant`. */
function tzOffsetMs(tz: string, instant: Date): number {
  const { y, m, d } = localYmd(tz, instant);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(y, m - 1, d, get("hour"), get("minute"), get("second"));
  // Drop sub-second precision on both sides so the difference is exact.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function dayBoundsInTz(
  tz: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  let zone = tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(now);
  } catch {
    // An unknown/garbage timezone must not 500 the kiosk.
    zone = FALLBACK_TZ;
  }

  const { y, m, d } = localYmd(zone, now);
  // Midnight local, expressed as UTC: take the naive UTC midnight for the
  // local Y/M/D and subtract the zone's offset at that moment. Computing the
  // offset at local noon (rather than at midnight) keeps this correct across
  // DST transitions, where midnight itself may not exist or may be ambiguous.
  const localNoonUtcGuess = new Date(Date.UTC(y, m - 1, d, 12));
  const offset = tzOffsetMs(zone, localNoonUtcGuess);
  const start = new Date(Date.UTC(y, m - 1, d) - offset);

  // Add a calendar day, then re-derive the offset so a DST boundary inside
  // the day yields a 23- or 25-hour day rather than a broken 24.
  const nextGuess = new Date(Date.UTC(y, m - 1, d + 1, 12));
  const nextOffset = tzOffsetMs(zone, nextGuess);
  const end = new Date(Date.UTC(y, m - 1, d + 1) - nextOffset);

  return { start, end };
}

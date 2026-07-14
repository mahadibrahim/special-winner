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

/**
 * The UTC instant of local midnight on y-m-d in `tz`.
 *
 * Treat the local wall-clock midnight as if it were UTC, then correct by the
 * zone's offset *at that instant* — and re-derive once, because the first
 * guess can land on the far side of a DST transition from the answer. US DST
 * transitions happen at 2am local, so an offset anchored at noon (or any
 * other fixed hour) can be the *wrong side's* offset for midnight itself;
 * this two-pass convergence is what actually gets midnight right.
 */
function localMidnightUtc(tz: string, y: number, m: number, d: number): Date {
  const wall = Date.UTC(y, m - 1, d);
  const firstOffset = tzOffsetMs(tz, new Date(wall));
  let t = wall - firstOffset;
  const secondOffset = tzOffsetMs(tz, new Date(t));
  if (secondOffset !== firstOffset) t = wall - secondOffset;
  return new Date(t);
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
  const start = localMidnightUtc(zone, y, m, d);
  // Add a calendar day, then re-derive local midnight so a DST boundary
  // inside the day yields a 23- or 25-hour day rather than a broken 24.
  const end = localMidnightUtc(zone, y, m, d + 1);

  return { start, end };
}

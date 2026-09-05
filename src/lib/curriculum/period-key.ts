/**
 * Period-key helpers for the monthly snapshot bucketing rewrite (Phase 3
 * S2). Pure, dependency-free — no DB, no clock reads beyond the `Date`
 * passed in — so they're safe to unit test directly and to share between
 * the recompute pipeline and any future reporting code.
 *
 * UTC CHOICE (deliberate): every function here buckets by the UTC calendar
 * date, not organization-local time. `player_assessments.assessedAt` is a
 * bare `timestamp` written by a coach at the moment they submit an
 * assessment — there is no per-write organization-timezone context to
 * convert with, and organizations span multiple timezones. Rather than
 * thread timezone through every assessment write and every snapshot read,
 * we accept the UTC calendar month as the bucket. The only user-visible
 * consequence is a coach entering an assessment in the last ~4-8 hours of a
 * local month (depending on timezone) occasionally has it bucket into the
 * next UTC month instead — a rounding edge nobody notices on a monthly
 * development-trend view, and one that's fully deterministic and testable
 * (unlike "whatever the org's configured timezone happens to be").
 */

/** Exported so callers (e.g. the development-reports `?period=` override) can validate shape without duplicating the pattern. */
export const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;
export const QUARTER_KEY_RE = /^(\d{4})-Q([1-4])$/;

/** `YYYY-MM` for the UTC calendar month containing `date`. */
export function periodKeyFor(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // getUTCMonth is 0-indexed
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `YYYY-Qn` for the UTC calendar quarter containing `date`. */
export function quarterKeyFor(date: Date): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1; // 1-4
  return `${year}-Q${quarter}`;
}

/**
 * The three monthly period keys that make up a quarter, in chronological
 * order. Throws on a malformed quarter key (documented invalid-input
 * behavior: this module never guesses at intent, it fails loudly so a
 * caller-side bug surfaces immediately rather than silently mis-bucketing).
 */
export function monthsOfQuarter(quarterKey: string): string[] {
  const match = QUARTER_KEY_RE.exec(quarterKey);
  if (!match) {
    throw new Error(`monthsOfQuarter: invalid quarter key "${quarterKey}" (expected YYYY-Qn)`);
  }
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const firstMonth = (quarter - 1) * 3 + 1; // 1-indexed calendar month
  return [0, 1, 2].map((offset) => {
    const month = firstMonth + offset;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

/**
 * The monthly period key immediately preceding `periodKey`, crossing the
 * year boundary correctly (2026-01 -> 2025-12). Throws on a malformed
 * period key — in particular, a `legacy:<seasonId>` key (pre-S2 rows) is
 * NOT a valid input here. This is intentional: legacy season-bucketed rows
 * are never meant to participate in the monthly trend chain, and a thrown
 * error at the boundary is safer than silently producing a nonsense key
 * that happens not to match anything.
 */
export function previousPeriod(periodKey: string): string {
  const match = MONTH_KEY_RE.exec(periodKey);
  if (!match) {
    throw new Error(`previousPeriod: invalid period key "${periodKey}" (expected YYYY-MM)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

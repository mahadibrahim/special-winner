export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface BalanceInput {
  id: string;
  dayOfWeek: DayKey | null;
}
export type BalanceMode = "fill-empty" | "rebalance";

/**
 * Assign each division a day, spreading them across `openDays` to keep per-day
 * counts as even as possible. Pure + deterministic (ties broken by id, then by
 * the caller's `openDays` ordering). Days-only capacity planning — time-of-day
 * and field assignment are out of scope (resolved later at game generation).
 *
 * - `fill-empty` (default): divisions that already have an open day keep it and
 *   count toward per-day load; only null-day (or closed-day) divisions are placed.
 * - `rebalance`: ignore existing days and redistribute everything evenly.
 */
export function balanceDays(
  divisions: BalanceInput[],
  openDays: DayKey[],
  opts: { mode?: BalanceMode } = {},
): Map<string, DayKey> {
  const mode = opts.mode ?? "fill-empty";
  const result = new Map<string, DayKey>();
  if (openDays.length === 0) return result;

  const load = new Map<DayKey, number>(openDays.map((d) => [d, 0]));
  const sorted = [...divisions].sort((a, b) => a.id.localeCompare(b.id));

  // Pin already-assigned divisions (fill-empty only, and only when their day is
  // open) and seed the load counts so new divisions avoid piling onto them.
  const toPlace: BalanceInput[] = [];
  for (const d of sorted) {
    if (mode === "fill-empty" && d.dayOfWeek && load.has(d.dayOfWeek)) {
      result.set(d.id, d.dayOfWeek);
      load.set(d.dayOfWeek, (load.get(d.dayOfWeek) ?? 0) + 1);
    } else {
      toPlace.push(d);
    }
  }

  // Greedily place each remaining division on the least-loaded open day. Ties
  // resolve to the earliest day in `openDays` (the loop keeps the first minimum).
  for (const d of toPlace) {
    let best = openDays[0];
    for (const day of openDays) {
      if ((load.get(day) ?? 0) < (load.get(best) ?? 0)) best = day;
    }
    result.set(d.id, best);
    load.set(best, (load.get(best) ?? 0) + 1);
  }
  return result;
}

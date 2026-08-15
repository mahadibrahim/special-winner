/**
 * Pure pattern to session-list generator for recurring rental blocks.
 *
 * The recurring rule is only a GENERATOR: the admin edits the resulting list
 * directly, which is how skip-dates, per-day times and multi-field sessions
 * are expressed. Nothing here touches the DB.
 *
 * Local dates are advanced by CALENDAR day and each session's instants are
 * resolved per-date in the org timezone. Advancing by 7 * 24h instead would
 * silently shift sessions by an hour across a DST boundary, and every winter
 * block crosses one.
 */
import { zonedMinuteToUtc } from "@/lib/activity-tracking/tz-day";

export interface BlockPatternDay {
  /** 0 = Sun ... 6 = Sat, in the org timezone. */
  weekday: number;
  /** Minutes past local midnight (1200 = 8:00 PM). */
  startMinute: number;
  durationMinutes: number;
  /** One session per venue per matching date. */
  venueIds: string[];
}

export interface BlockPattern {
  timeZone: string;
  /** YYYY-MM-DD, local. */
  firstDate: string;
  /** YYYY-MM-DD, local, inclusive. */
  lastDate: string;
  days: BlockPatternDay[];
  /** YYYY-MM-DD, local. */
  excludedDates?: string[];
}

export interface GeneratedSession {
  /** `${date}|${venueId}|${startMinute}` — stable across regeneration. */
  key: string;
  /** YYYY-MM-DD, local. */
  date: string;
  venueId: string;
  startMinute: number;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `zonedMinuteToUtc` is capped at 1440; roll past-midnight minutes to the next date. */
export function localMinuteToUtc(date: string, minute: number, tz: string): Date {
  if (minute <= 1440) return zonedMinuteToUtc(date, minute, tz);
  const days = Math.floor(minute / 1440);
  return zonedMinuteToUtc(addLocalDays(date, days), minute - days * 1440, tz);
}

/** Calendar-day arithmetic on a YYYY-MM-DD string, via UTC to dodge local-tz drift. */
function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Day of week (0 = Sun) of a YYYY-MM-DD calendar date. Timezone-independent. */
function localWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function generateBlockSessions(pattern: BlockPattern): GeneratedSession[] {
  const { timeZone, firstDate, lastDate, days, excludedDates } = pattern;
  if (!DATE_RE.test(firstDate)) throw new Error(`invalid firstDate '${firstDate}'`);
  if (!DATE_RE.test(lastDate)) throw new Error(`invalid lastDate '${lastDate}'`);
  if (lastDate < firstDate) throw new Error("lastDate must not precede firstDate");

  const excluded = new Set(excludedDates ?? []);
  const byWeekday = new Map<number, BlockPatternDay[]>();
  for (const day of days) {
    const list = byWeekday.get(day.weekday) ?? [];
    list.push(day);
    byWeekday.set(day.weekday, list);
  }

  const out: GeneratedSession[] = [];
  for (let date = firstDate; date <= lastDate; date = addLocalDays(date, 1)) {
    if (excluded.has(date)) continue;
    for (const day of byWeekday.get(localWeekday(date)) ?? []) {
      for (const venueId of day.venueIds) {
        out.push({
          key: `${date}|${venueId}|${day.startMinute}`,
          date,
          venueId,
          startMinute: day.startMinute,
          durationMinutes: day.durationMinutes,
          startsAt: localMinuteToUtc(date, day.startMinute, timeZone),
          endsAt: localMinuteToUtc(date, day.startMinute + day.durationMinutes, timeZone),
        });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

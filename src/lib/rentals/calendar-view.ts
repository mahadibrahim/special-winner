/**
 * Pure view helpers for the admin rental calendar.
 *
 * The endpoint (`/api/admin/rentals/calendar`) returns a flat list of ledger
 * claims and quote markers; both read-only views turn that into occupancy.
 * Keeping the derivation here rather than inside the components makes the
 * month arithmetic and the slot classification unit-testable, and stops the
 * finder and the grid from drifting apart about what "booked" means.
 *
 * Nothing in this file touches the DB or the network, so it runs in the
 * browser island unchanged.
 */
import { zonedMinuteToUtc } from "@/lib/activity-tracking/tz-day";

export interface CalendarVenue {
  id: string;
  name: string;
  fieldNumbers: number[];
  rentalOpenMinute: number | null;
  rentalCloseMinute: number | null;
}

export interface CalendarBusy {
  venueId: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  sourceType: "game" | "drop_in" | "rental" | "external" | "maintenance" | "practice";
  sourceId: string | null;
  label: string;
}

export interface CalendarQuote {
  venueId: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  blockId: string;
  label: string;
}

export interface CalendarPayload {
  timeZone: string;
  from: string;
  to: string;
  venues: CalendarVenue[];
  busy: CalendarBusy[];
  quotes: CalendarQuote[];
}

/** Free, sold, softly held by a draft quote, or fenced by the facility. */
export type SlotState = "open" | "rental" | "quoted" | "reserved";

export interface SlotStatus {
  state: SlotState;
  /** The conflicting claim's label, or null when the slot is open. */
  label: string | null;
}

export const SLOT_GLYPH: Record<SlotState, string> = {
  open: "●", // filled circle
  rental: "○", // hollow circle
  quoted: "△", // triangle
  reserved: "■", // filled square
};

export const SLOT_WORD: Record<SlotState, string> = {
  open: "open",
  rental: "booked",
  quoted: "quoted",
  reserved: "reserved",
};

/**
 * A rental is inventory sold; everything else on the ledger (games, drop-ins,
 * external partner bookings, internal reserves) is inventory the facility has
 * already spent. The finder legend collapses the latter into one glyph.
 */
function stateForSource(sourceType: CalendarBusy["sourceType"]): SlotState {
  return sourceType === "rental" ? "rental" : "reserved";
}

export const fieldKey = (venueId: string, fieldNumber: number): string =>
  `${venueId}|${fieldNumber}`;

export interface Interval {
  startMs: number;
  endMs: number;
}

export interface FieldIndex {
  busy: Map<string, Array<CalendarBusy & Interval>>;
  quotes: Map<string, Array<CalendarQuote & Interval>>;
}

/** Bucket the flat payload by field so a strip of 12 weeks is 12 small scans. */
export function indexByField(payload: {
  busy: CalendarBusy[];
  quotes: CalendarQuote[];
}): FieldIndex {
  const busy = new Map<string, Array<CalendarBusy & Interval>>();
  for (const b of payload.busy) {
    const key = fieldKey(b.venueId, b.fieldNumber);
    const list = busy.get(key) ?? [];
    list.push({ ...b, startMs: Date.parse(b.startsAt), endMs: Date.parse(b.endsAt) });
    busy.set(key, list);
  }
  const quotes = new Map<string, Array<CalendarQuote & Interval>>();
  for (const q of payload.quotes) {
    const key = fieldKey(q.venueId, q.fieldNumber);
    const list = quotes.get(key) ?? [];
    list.push({ ...q, startMs: Date.parse(q.startsAt), endMs: Date.parse(q.endsAt) });
    quotes.set(key, list);
  }
  return { busy, quotes };
}

const overlaps = (a: Interval, startMs: number, endMs: number): boolean =>
  a.startMs < endMs && a.endMs > startMs;

/**
 * What a candidate window on one field is worth right now. A hard ledger claim
 * always wins over a soft quote marker: an admin needs to know the slot is gone
 * before they need to know somebody else asked about it.
 */
export function classifySlot(
  index: FieldIndex,
  venueId: string,
  fieldNumber: number,
  startMs: number,
  endMs: number,
): SlotStatus {
  const key = fieldKey(venueId, fieldNumber);
  const hit = (index.busy.get(key) ?? []).find((b) => overlaps(b, startMs, endMs));
  if (hit) return { state: stateForSource(hit.sourceType), label: hit.label };

  const quoted = (index.quotes.get(key) ?? []).find((q) => overlaps(q, startMs, endMs));
  if (quoted) return { state: "quoted", label: quoted.label };

  return { state: "open", label: null };
}

/* ------------------------------------------------------------------ *
 * Calendar-month arithmetic
 * ------------------------------------------------------------------ */

export interface CalendarMonth {
  year: number;
  /** 0-based, matching Date's month convention. */
  month: number;
}

/** Advance by CALENDAR month. Adding 30 days walks off the month boundary. */
export function shiftMonth(m: CalendarMonth, delta: number): CalendarMonth {
  const total = m.year * 12 + m.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function daysInMonth(m: CalendarMonth): number {
  return new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
}

/** Every YYYY-MM-DD in the month, in order. */
export function monthDates(m: CalendarMonth): string[] {
  const count = daysInMonth(m);
  const out: string[] = [];
  for (let d = 1; d <= count; d++) {
    out.push(`${m.year}-${pad(m.month + 1)}-${pad(d)}`);
  }
  return out;
}

/** Empty cells before the 1st so the grid's columns line up with weekdays. */
export function monthLeadingBlanks(m: CalendarMonth): number {
  return new Date(Date.UTC(m.year, m.month, 1)).getUTCDay();
}

/** The inclusive `from`/`to` the calendar endpoint wants for this month. */
export function monthRange(m: CalendarMonth): { from: string; to: string } {
  const dates = monthDates(m);
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function monthTitle(m: CalendarMonth): string {
  return new Date(Date.UTC(m.year, m.month, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** The month a YYYY-MM-DD string falls in. */
export function monthOf(date: string): CalendarMonth {
  const [y, mo] = date.split("-").map(Number);
  return { year: y, month: mo - 1 };
}

/* ------------------------------------------------------------------ *
 * Occupancy
 * ------------------------------------------------------------------ */

/** Prime time is what a winter inquiry is actually about: 6pm to midnight. */
export const PRIME_START_MINUTE = 18 * 60;
export const PRIME_END_MINUTE = 24 * 60;

/** Facility fallback window when a venue leaves its rental hours unset. */
export const FALLBACK_OPEN_MINUTE = 16 * 60;
export const FALLBACK_CLOSE_MINUTE = 24 * 60;

/**
 * Minutes of [windowStart, windowEnd) claimed by `intervals`, counting
 * overlapping claims once. Merge-then-sum rather than sum-then-hope: two
 * half-field rows on the same hour are one busy hour, not two.
 */
export function busyMinutesInWindow(
  intervals: Interval[],
  windowStartMs: number,
  windowEndMs: number,
): number {
  const clipped = intervals
    .map((i) => ({
      startMs: Math.max(i.startMs, windowStartMs),
      endMs: Math.min(i.endMs, windowEndMs),
    }))
    .filter((i) => i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  let total = 0;
  let cursorEnd = -Infinity;
  for (const i of clipped) {
    const start = Math.max(i.startMs, cursorEnd);
    if (i.endMs > start) total += i.endMs - start;
    cursorEnd = Math.max(cursorEnd, i.endMs);
  }
  return Math.round(total / 60_000);
}

export interface DayFill {
  date: string;
  /** Prime-time minutes claimed across every field of every rental venue. */
  busyMinutes: number;
  totalMinutes: number;
  /** Whole open hours left in prime time, floored - the number staff quote. */
  openHours: number;
  fillRatio: number;
}

/**
 * Prime-time fill for one local calendar day. The window edges resolve through
 * `zonedMinuteToUtc` per date, so the two DST Sundays land on the right hour
 * instead of an hour either side of it.
 */
export function dayPrimeFill(
  index: FieldIndex,
  venues: CalendarVenue[],
  date: string,
  timeZone: string,
): DayFill {
  const windowStartMs = zonedMinuteToUtc(date, PRIME_START_MINUTE, timeZone).getTime();
  const windowEndMs = zonedMinuteToUtc(date, PRIME_END_MINUTE, timeZone).getTime();

  let busyMinutes = 0;
  let totalMinutes = 0;
  for (const venue of venues) {
    for (const fieldNumber of venue.fieldNumbers) {
      totalMinutes += Math.round((windowEndMs - windowStartMs) / 60_000);
      busyMinutes += busyMinutesInWindow(
        index.busy.get(fieldKey(venue.id, fieldNumber)) ?? [],
        windowStartMs,
        windowEndMs,
      );
    }
  }

  const openMinutes = Math.max(totalMinutes - busyMinutes, 0);
  return {
    date,
    busyMinutes,
    totalMinutes,
    openHours: Math.floor(openMinutes / 60),
    fillRatio: totalMinutes === 0 ? 0 : busyMinutes / totalMinutes,
  };
}

/**
 * The hour rows the day drill-in shows: the widest rental window across the
 * location's venues, falling back to the facility's stated 4pm-midnight.
 */
export function dayHourWindow(venues: CalendarVenue[]): {
  openMinute: number;
  closeMinute: number;
} {
  const opens = venues
    .map((v) => v.rentalOpenMinute)
    .filter((v): v is number => v != null);
  const closes = venues
    .map((v) => v.rentalCloseMinute)
    .filter((v): v is number => v != null);
  const openMinute = opens.length > 0 ? Math.min(...opens) : FALLBACK_OPEN_MINUTE;
  const closeMinute = closes.length > 0 ? Math.max(...closes) : FALLBACK_CLOSE_MINUTE;
  // A misconfigured venue must not produce a zero-row table.
  return closeMinute > openMinute
    ? { openMinute, closeMinute }
    : { openMinute: FALLBACK_OPEN_MINUTE, closeMinute: FALLBACK_CLOSE_MINUTE };
}

/** "8 PM" from minutes past local midnight. */
export function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export interface StripCounts {
  open: number;
  rental: number;
  quoted: number;
  reserved: number;
}

export function tallyStates(states: SlotState[]): StripCounts {
  const counts: StripCounts = { open: 0, rental: 0, quoted: 0, reserved: 0 };
  for (const s of states) counts[s] += 1;
  return counts;
}

/** "9 open · 1 booked · 1 quoted" - only the non-zero buckets. */
export function summarizeCounts(counts: StripCounts): string {
  const parts: string[] = [];
  if (counts.open > 0) parts.push(`${counts.open} open`);
  if (counts.rental > 0) parts.push(`${counts.rental} booked`);
  if (counts.quoted > 0) parts.push(`${counts.quoted} quoted`);
  if (counts.reserved > 0) parts.push(`${counts.reserved} reserved`);
  return parts.length > 0 ? parts.join(" · ") : "no dates";
}

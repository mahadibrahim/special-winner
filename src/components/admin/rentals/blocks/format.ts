/**
 * Display helpers for block money and block times.
 *
 * Block money is whole dollars everywhere: $2,808, never $2,808.00. Cents
 * exist only because Stripe and the schema store minor units, so a value that
 * is not a multiple of 100 reaching the UI is a bug upstream — flagged in dev
 * rather than silently rounded away on screen.
 */

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatDollars(cents: number): string {
  if (import.meta.env.DEV && cents % 100 !== 0) {
    console.warn(`[blocks] non-whole-dollar amount reached the UI: ${cents}`);
  }
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** "Tue Jan 6" in the org timezone. */
export function fmtSessionDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "8:00 PM" in the org timezone. */
export function fmtSessionTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jan 6, 2043" in the org timezone. */
export function fmtDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

/** "20:00" → 1200 minutes past local midnight. */
export function timeInputToMinute(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

/** 1200 → "20:00", the value an `<input type="time">` expects. */
export function minuteToTimeInput(minute: number): string {
  const hh = Math.floor(minute / 60) % 24;
  const mm = minute % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function durationLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

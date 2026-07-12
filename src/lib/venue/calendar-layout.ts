/**
 * Converts a UTC ISO instant to a 1-based grid row number using wall-clock
 * time in the given IANA timezone (e.g. "America/New_York").
 *
 * Row 1 = dayStartHour:00, row 2 = dayStartHour:30, etc.
 * Each row represents a 30-minute slot.
 */
export function timeToRow(iso: string, dayStartHour: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const hourStr   = parts.find((p) => p.type === "hour")?.value   ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);
  const minutes = (hour - dayStartHour) * 60 + minute;
  return Math.floor(minutes / 30) + 1;
}

export function blockRows(
  startsAt: string,
  endsAt: string,
  dayStartHour: number,
  timeZone: string,
) {
  return {
    rowStart: timeToRow(startsAt, dayStartHour, timeZone),
    rowEnd:   timeToRow(endsAt,   dayStartHour, timeZone),
  };
}

export function columnsForSpaces(spaces: { id: string; name: string }[]) {
  return spaces.map((s, i) => ({ ...s, index: i + 2 }));
}

/**
 * Clamps a block's row span to the visible grid window `[1, totalRows + 1]`.
 *
 * A session that starts before the grid's opening hour or ends after its
 * closing hour (e.g. a pickup game created moments after midnight, or any
 * activity logged outside the 8am–9pm business-hours window the day grid
 * renders) otherwise produces a negative or out-of-range row number. Since
 * ScheduleCalendar turns rows directly into an absolute `top` pixel offset,
 * an out-of-range row pushes the block's box outside its grid container —
 * far enough to overlap the sticky header/search bar above it, which
 * silently swallows pointer events aimed at the block (Playwright surfaces
 * this as "<element> subtree intercepts pointer events" on click). Clamping
 * keeps every block's rendered box inside the container, at least one row
 * tall, regardless of how far outside business hours it actually falls.
 *
 * `clamped` is true whenever the block's true time window fell (fully or
 * partly) outside the grid — callers use this to render an "off-hours" chip
 * so a clamped block (which visually lands right at 8am/9pm) doesn't get
 * mistaken for a normal on-the-hour session.
 */
export function clampRowsToWindow(
  rowStart: number,
  rowEnd: number,
  totalRows: number,
): { rowStart: number; rowEnd: number; clamped: boolean } {
  const clampedStart = Math.min(Math.max(rowStart, 1), totalRows);
  const clampedEnd = Math.min(Math.max(rowEnd, clampedStart + 1), totalRows + 1);
  const clamped = rowStart < 1 || rowEnd > totalRows + 1;
  return { rowStart: clampedStart, rowEnd: clampedEnd, clamped };
}

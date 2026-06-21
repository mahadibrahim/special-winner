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

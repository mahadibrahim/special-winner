// iCal generation utilities

interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  url?: string;
}

// Format date to iCal format (YYYYMMDDTHHmmssZ)
function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Escape special characters for iCal
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Fold long lines (iCal spec requires lines <= 75 chars)
function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) return line;

  let result = "";
  let remaining = line;

  while (remaining.length > 0) {
    if (result.length > 0) {
      result += "\r\n ";
      remaining = remaining.slice(maxLength - 1);
    }
    result += remaining.slice(0, result.length === 0 ? maxLength : maxLength - 1);
    if (result.length === 0) break;
    remaining = remaining.slice(maxLength);
  }

  return result;
}

export function generateICalEvent(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatICalDate(new Date())}`,
    `DTSTART:${formatICalDate(event.startDate)}`,
    `DTEND:${formatICalDate(event.endDate)}`,
    `SUMMARY:${escapeICalText(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  lines.push("END:VEVENT");

  return lines.map(foldLine).join("\r\n");
}

export function generateICalFeed(
  calendarName: string,
  events: CalendarEvent[]
): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aspire Sports//Calendar//EN",
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const footer = ["END:VCALENDAR"];

  const eventStrings = events.map(generateICalEvent);

  return [...header, ...eventStrings, ...footer].join("\r\n");
}

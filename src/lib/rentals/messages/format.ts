/**
 * Pure formatting helpers for rental messages. Kept free of email/React
 * imports so it can be unit-tested without pulling the email render stack.
 */

const DEFAULT_TZ = "America/New_York";

/**
 * "Sat, Jun 20 · 6:00 – 7:30 PM" — a single date with a start–end time range,
 * formatted in the venue's (org's) timezone.
 */
export function formatRentalWindow(
  start: Date,
  end: Date,
  tz: string | null,
): string {
  const timeZone = tz ?? DEFAULT_TZ;
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

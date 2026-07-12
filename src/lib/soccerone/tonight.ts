// Pure helpers for the homepage "pickup tonight" strip. SoccerOne is a
// Columbus, OH business — "tonight" means the org's local calendar day,
// not the viewer's. All timestamps in the DB/API are UTC instants.

const SO_TZ = "America/New_York";

function tzClock(d: Date, tz: string): { hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

export function todayWindow(
  now: Date = new Date(),
  tz: string = SO_TZ,
): { fromIso: string; toIso: string } {
  const { hour, minute, second } = tzClock(now, tz);
  const secsIntoDay = hour * 3600 + minute * 60 + second;
  const msIntoDay = secsIntoDay * 1000 + now.getMilliseconds();
  const endOfDay = new Date(now.getTime() + (86_400_000 - msIntoDay));
  return { fromIso: now.toISOString(), toIso: endOfDay.toISOString() };
}

export function formatSessionTime(iso: string, tz: string = SO_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTodayLabel(now: Date = new Date(), tz: string = SO_TZ): string {
  return now
    .toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .replace(/,/g, "")
    .toUpperCase();
}

export function facilityLabel(venueName: string | null): string {
  if (!venueName) return "";
  if (/worthington/i.test(venueName)) return "Worthington";
  if (/downtown|starr/i.test(venueName)) return "Downtown";
  return venueName;
}

export function skillChip(
  level: "recreational" | "intermediate" | "advanced" | "all_levels",
): string {
  switch (level) {
    case "recreational": return "REC";
    case "intermediate": return "INTERMEDIATE";
    case "advanced":     return "ADVANCED";
    case "all_levels":   return "OPEN";
  }
}

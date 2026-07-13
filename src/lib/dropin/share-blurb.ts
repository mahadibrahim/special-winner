/**
 * Prewritten share text for a pickup game — used by the host share sheet
 * and the fill-alert SMS body. Pure; timezone passed in (org display tz).
 */
const SPORT_EMOJI: Record<string, string> = {
  soccer: "⚽",
  futsal: "⚽",
  basketball: "🏀",
  volleyball: "🏐",
  hockey: "🏒",
};

export function buildShareBlurb(opts: {
  sport: string;
  venueName: string | null;
  startsAt: Date;
  spotsLeft: number;
  url: string;
  timeZone: string;
}): string {
  const emoji = SPORT_EMOJI[opts.sport.toLowerCase()] ?? "🏟️";
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
  }).format(opts.startsAt);
  const where = opts.venueName ? ` at ${opts.venueName}` : "";
  const spots =
    opts.spotsLeft === 1 ? "1 spot left" : `${opts.spotsLeft} spots left`;
  return `${emoji} Pickup ${opts.sport}${where} — ${when}. ${spots}. Join: ${opts.url}`;
}

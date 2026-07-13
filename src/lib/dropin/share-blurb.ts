/**
 * Prewritten share text for a pickup game — used by the host share sheet
 * and the fill-alert SMS body. Pure; timezone passed in (org display tz).
 *
 * `sport` is often free admin text (drop_in_sessions.sport_or_class_label,
 * e.g. "Evening Coed Pickup"), not a sport slug — so emoji lookup matches
 * on substring (mirrors the pattern in pickup-card.tsx's sportTint), and
 * the "Pickup " prefix is skipped when the label already says "pickup" to
 * avoid "Pickup Evening Coed Pickup".
 */
const SPORT_EMOJI: ReadonlyArray<{ match: string; emoji: string }> = [
  { match: "soccer", emoji: "⚽" },
  { match: "futsal", emoji: "⚽" },
  { match: "basketball", emoji: "🏀" },
  { match: "volleyball", emoji: "🏐" },
  { match: "hockey", emoji: "🏒" },
];

function sportEmoji(label: string): string {
  const lower = label.toLowerCase();
  return SPORT_EMOJI.find((s) => lower.includes(s.match))?.emoji ?? "🏟️";
}

export function buildShareBlurb(opts: {
  sport: string;
  venueName: string | null;
  startsAt: Date;
  spotsLeft: number;
  url: string;
  timeZone: string;
}): string {
  const emoji = sportEmoji(opts.sport);
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
  }).format(opts.startsAt);
  const where = opts.venueName ? ` at ${opts.venueName}` : "";
  const spots =
    opts.spotsLeft === 1 ? "1 spot left" : `${opts.spotsLeft} spots left`;
  const label = /pickup/i.test(opts.sport) ? opts.sport : `Pickup ${opts.sport}`;
  return `${emoji} ${label}${where} — ${when}. ${spots}. Join: ${opts.url}`;
}

/** Days a NPS survey link stays usable. */
export const NPS_EXPIRY_DAYS = 14;
/** Days a referee-rating link stays usable (the moment fades fast). */
export const REFEREE_EXPIRY_DAYS = 7;
/** One NPS survey per kind per recipient per this many days. */
export const NPS_COOLDOWN_DAYS = 90;
/** Max one referee-rating email per recipient per rolling window. */
export const REFEREE_DAILY_CAP_HOURS = 24;
/** How long after an event ends before we ask about it. */
export const POST_EVENT_DELAY_HOURS = 2;
/** Dispatch only considers events that ended within this window (no ancient backfill). */
export const DISPATCH_LOOKBACK_DAYS = 7;
/** Seasons get a wider lookback — endDate is a date, and the cron may lag. */
export const SEASON_LOOKBACK_DAYS = 14;

export type NpsCategory = "promoter" | "passive" | "detractor";

/** Standard NPS banding: 9-10 promoter, 7-8 passive, 0-6 detractor. */
export function npsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

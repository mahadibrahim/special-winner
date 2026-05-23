/**
 * The marketing welcome series: a 3-email welcome → story → activation drip
 * for first-time registrants. Day offsets are measured from the user's
 * `welcome_series_enrolled_at`. Tune the cadence by editing this array.
 */
export interface WelcomeSeriesStep {
  step: 1 | 2 | 3;
  dayOffset: number;
  emailType: string;
}

export const WELCOME_SERIES_STEPS: readonly WelcomeSeriesStep[] = [
  { step: 1, dayOffset: 2, emailType: "welcome_series_1" },
  { step: 2, dayOffset: 5, emailType: "welcome_series_2" },
  { step: 3, dayOffset: 10, emailType: "welcome_series_3" },
] as const;

/** The window (days) a user stays a drip candidate after enrollment. */
export const WELCOME_SERIES_WINDOW_DAYS =
  WELCOME_SERIES_STEPS[WELCOME_SERIES_STEPS.length - 1].dayOffset + 1;

/**
 * Pure: given a user's enrollment date, opt-out date, the set of
 * welcome-series emailTypes already sent, and "now", return the steps that
 * are due to send. Returns nothing if the user has opted out.
 */
export function dueWelcomeSeriesSteps(input: {
  enrolledAt: Date;
  optedOutAt: Date | null;
  sentEmailTypes: Set<string>;
  now: Date;
}): WelcomeSeriesStep[] {
  if (input.optedOutAt) return [];
  const daysSince = Math.floor(
    (input.now.getTime() - input.enrolledAt.getTime()) / 86_400_000,
  );
  return WELCOME_SERIES_STEPS.filter(
    (s) => daysSince >= s.dayOffset && !input.sentEmailTypes.has(s.emailType),
  );
}

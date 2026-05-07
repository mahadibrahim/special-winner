/**
 * Stage computation for activity-tracking reminders.
 *
 * Given the current time, the activity's `expected_at`, and an optional
 * per-activity `reminder_policy` override, returns which reminder stage
 * (if any) should fire right now:
 *   - pre_reminder       → 15min (default) before expected_at
 *   - overdue_alert      → 15min (default) after  expected_at
 *   - escalation         → 60min (default) after  expected_at
 *   - final_escalation   → escalation + 60min after expected_at
 *
 * Returns `null` when we're outside any reminder window. The caller is
 * responsible for de-duping with `stageAlreadyFired` against the
 * activity completion's `reminders_fired` array.
 */
export type Stage =
  | "pre_reminder"
  | "overdue_alert"
  | "escalation"
  | "final_escalation";

export interface ReminderPolicy {
  pre_reminder_minutes?: number;
  overdue_alert_minutes?: number;
  escalation_minutes?: number;
}

const DEFAULTS = {
  pre_reminder_minutes: 15,
  overdue_alert_minutes: 15,
  escalation_minutes: 60,
} as const;

const FINAL_ESCALATION_DELTA_MIN = 60; // additional minutes past escalation

export function computeStage(
  now: Date,
  expectedAt: Date,
  policy?: ReminderPolicy,
): Stage | null {
  const preMin = policy?.pre_reminder_minutes ?? DEFAULTS.pre_reminder_minutes;
  const overMin =
    policy?.overdue_alert_minutes ?? DEFAULTS.overdue_alert_minutes;
  const escMin = policy?.escalation_minutes ?? DEFAULTS.escalation_minutes;
  const finalMin = escMin + FINAL_ESCALATION_DELTA_MIN;

  const ms = (m: number) => m * 60 * 1000;
  const t = now.getTime();
  const e = expectedAt.getTime();

  if (t >= e + ms(finalMin)) return "final_escalation";
  if (t >= e + ms(escMin)) return "escalation";
  if (t >= e + ms(overMin)) return "overdue_alert";
  if (t >= e - ms(preMin)) return "pre_reminder";
  return null;
}

export interface RemindersFiredEntry {
  stage: Stage;
  channel?: string;
  recipient_user_id?: string;
  fired_at?: string;
  delivery_status?: string;
  error?: string;
}

export function stageAlreadyFired(
  remindersFired: RemindersFiredEntry[] | unknown,
  stage: Stage,
): boolean {
  if (!Array.isArray(remindersFired)) return false;
  return remindersFired.some(
    (r) => r != null && typeof r === "object" && (r as { stage?: string }).stage === stage,
  );
}

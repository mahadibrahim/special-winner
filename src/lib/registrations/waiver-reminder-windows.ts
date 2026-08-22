/**
 * Pure date-math for the waiver-reminder cadence.
 *
 * Given a registration's age (days since it was created/paid) and how soon
 * its season starts (hours), returns which reminder window(s) are due right
 * now. Kept pure and unit-tested in isolation — the cron endpoint
 * (`src/pages/api/cron/send-waiver-reminders.ts`) implements the same
 * boundaries as SQL predicates so it can query per-window without pulling
 * every unsigned registration into memory; keep the two in sync if either
 * changes.
 *
 * Cadence:
 *  - day 0:      none due yet.
 *  - day [1, 4):  "1"       (createdAt <= now - 1d)
 *  - day [4, 8):  "1" + "2" (createdAt <= now - 4d). "1" is still
 *    technically due at this point too — in practice email_logs
 *    idempotency means "1" was already sent on day 1, so only "2" ends up
 *    being a new send.
 *  - day [8, ∞):  weekly "w{N}", where
 *    N = min(8, floor((ageDays - 8) / 7) + 1) — capped at w8 so a
 *    long-neglected registration doesn't grow an unbounded reminder count.
 *  - "final" fires whenever the season starts within 48 hours, regardless
 *    of the registration's age — and it SUPPRESSES the age-window reminder
 *    for that run (#459, owner decision 2026-08-22): one email that morning,
 *    not two. Before this, an age-window w{N} and the final could both fire
 *    in the same cron run.
 *
 * reminder_number mapping used by the cron's analytics capture: "1" -> 1,
 * "2" -> 2, "w{N}" -> 7+N (so w1 -> 8 ... w8 -> 15), "final" -> 99.
 */
export type WaiverReminderWindowType =
  | "1"
  | "2"
  | "w1"
  | "w2"
  | "w3"
  | "w4"
  | "w5"
  | "w6"
  | "w7"
  | "w8"
  | "final";

export function computeWaiverReminderWindows(
  ageDays: number,
  hoursUntilStart: number,
): WaiverReminderWindowType[] {
  // Final-48h wins outright (#459): the urgent email is the only one that
  // morning. The age-window reminder it displaces is not "missed" — the
  // final one carries the same ask with more urgency.
  if (hoursUntilStart <= 48) {
    return ["final"];
  }

  const windows: WaiverReminderWindowType[] = [];

  if (ageDays >= 1 && ageDays < 4) {
    windows.push("1");
  } else if (ageDays >= 4 && ageDays < 8) {
    windows.push("1", "2");
  } else if (ageDays >= 8) {
    const weekNumber = Math.min(8, Math.floor((ageDays - 8) / 7) + 1);
    windows.push(`w${weekNumber}` as WaiverReminderWindowType);
  }

  return windows;
}

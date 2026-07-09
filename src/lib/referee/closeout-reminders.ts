export type ReminderAction = "none" | "send_first" | "send_second";

const HOURS_2 = 2 * 60 * 60 * 1000;

/**
 * Next occurrence of `hourEt` o'clock Eastern, at or after `after`, expressed
 * as a UTC Date. Uses a fixed EDT offset (UTC-4) — good enough for a nudge
 * cadence; we are not scheduling anything safety-critical on DST edges.
 */
function nextMorningEt(after: Date, hourEt: number): Date {
  const etOffsetMs = 4 * 60 * 60 * 1000; // EDT
  const etNow = new Date(after.getTime() - etOffsetMs);
  const etMorning = new Date(Date.UTC(etNow.getUTCFullYear(), etNow.getUTCMonth(), etNow.getUTCDate(), hourEt, 0, 0));
  let utc = new Date(etMorning.getTime() + etOffsetMs);
  if (utc.getTime() <= after.getTime()) utc = new Date(utc.getTime() + 24 * 60 * 60 * 1000);
  return utc;
}

export function decideReminderAction(args: {
  now: Date; scheduledAt: Date; status: string; stage: number; morningHourEt?: number;
}): ReminderAction {
  const { now, scheduledAt, status, stage } = args;
  if (status === "completed") return "none";
  if (stage === 0) {
    return now.getTime() >= scheduledAt.getTime() + HOURS_2 ? "send_first" : "none";
  }
  if (stage === 1) {
    const firstSentAtOrAfter = new Date(scheduledAt.getTime() + HOURS_2);
    const morning = nextMorningEt(firstSentAtOrAfter, args.morningHourEt ?? 8);
    return now.getTime() >= morning.getTime() ? "send_second" : "none";
  }
  return "none"; // stage >= 2: stop
}

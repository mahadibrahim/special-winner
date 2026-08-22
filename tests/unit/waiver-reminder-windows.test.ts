import { describe, it, expect } from "vitest";
import { computeWaiverReminderWindows } from "@/lib/registrations/waiver-reminder-windows";

// "Far" hours-until-start — big enough that the 48h "final" window never
// fires, so these cases isolate the age-based cadence.
const FAR_HOURS = 24 * 365;

describe("computeWaiverReminderWindows", () => {
  it("returns no windows for a same-day registration", () => {
    expect(computeWaiverReminderWindows(0, FAR_HOURS)).toEqual([]);
  });

  it("returns window 1 at day 1", () => {
    expect(computeWaiverReminderWindows(1, FAR_HOURS)).toEqual(["1"]);
  });

  it("stays on window 1 through day 3", () => {
    expect(computeWaiverReminderWindows(3, FAR_HOURS)).toEqual(["1"]);
  });

  it("returns windows 1 and 2 at day 4 (r1 already sent in practice; r2 is new)", () => {
    expect(computeWaiverReminderWindows(4, FAR_HOURS)).toEqual(["1", "2"]);
  });

  it("returns weekly window w1 at day 8", () => {
    expect(computeWaiverReminderWindows(8, FAR_HOURS)).toEqual(["w1"]);
  });

  it("returns weekly window w2 at day 15", () => {
    expect(computeWaiverReminderWindows(15, FAR_HOURS)).toEqual(["w2"]);
  });

  it("caps at w8 for a long-neglected registration (57+ days)", () => {
    expect(computeWaiverReminderWindows(57, FAR_HOURS)).toEqual(["w8"]);
    expect(computeWaiverReminderWindows(200, FAR_HOURS)).toEqual(["w8"]);
  });

  it("fires final whenever the season starts within 48 hours, regardless of age", () => {
    expect(computeWaiverReminderWindows(0, 48)).toEqual(["final"]);
    expect(computeWaiverReminderWindows(0, 10)).toEqual(["final"]);
  });

  it("final SUPPRESSES the age window when both apply — one email that morning (#459)", () => {
    // Owner decision 2026-08-22: before this, day-8 + 24h-to-start fired
    // both w1 and final in the same cron run — two waiver emails in one
    // morning. The final reminder carries the same ask with more urgency,
    // so it's the only one sent.
    expect(computeWaiverReminderWindows(8, 24)).toEqual(["final"]);
    expect(computeWaiverReminderWindows(1, 48)).toEqual(["final"]);
  });

  it("does not fire final beyond the 48h boundary", () => {
    expect(computeWaiverReminderWindows(0, 49)).toEqual([]);
  });
});

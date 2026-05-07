import { describe, it, expect } from "vitest";
import {
  computeStage,
  stageAlreadyFired,
} from "@/lib/activity-tracking/stage";

const expectedAt = new Date("2026-06-03T18:00:00Z");

describe("computeStage", () => {
  it("returns null when before pre-reminder window", () => {
    expect(
      computeStage(new Date("2026-06-03T17:30:00Z"), expectedAt),
    ).toBeNull();
  });

  it("returns pre_reminder 15min before expectedAt", () => {
    expect(
      computeStage(new Date("2026-06-03T17:50:00Z"), expectedAt),
    ).toBe("pre_reminder");
  });

  it("returns overdue_alert 15min after expectedAt", () => {
    expect(
      computeStage(new Date("2026-06-03T18:20:00Z"), expectedAt),
    ).toBe("overdue_alert");
  });

  it("returns escalation 60min after expectedAt", () => {
    expect(
      computeStage(new Date("2026-06-03T19:10:00Z"), expectedAt),
    ).toBe("escalation");
  });

  it("returns final_escalation 120min after expectedAt", () => {
    expect(
      computeStage(new Date("2026-06-03T20:10:00Z"), expectedAt),
    ).toBe("final_escalation");
  });

  it("respects per-activity reminder_policy override", () => {
    const policy = {
      pre_reminder_minutes: 60,
      overdue_alert_minutes: 5,
      escalation_minutes: 30,
    };
    // 30min before → pre_reminder (since pre_reminder_minutes=60)
    expect(
      computeStage(new Date("2026-06-03T17:30:00Z"), expectedAt, policy),
    ).toBe("pre_reminder");
    // 10min after → overdue_alert (since overdue_alert_minutes=5)
    expect(
      computeStage(new Date("2026-06-03T18:10:00Z"), expectedAt, policy),
    ).toBe("overdue_alert");
  });
});

describe("stageAlreadyFired", () => {
  it("returns true when reminders_fired contains the stage", () => {
    const fired = [
      { stage: "pre_reminder", channel: "sms", recipient_user_id: "u1" },
    ];
    expect(stageAlreadyFired(fired, "pre_reminder")).toBe(true);
  });

  it("returns false when reminders_fired does not contain the stage", () => {
    const fired = [
      { stage: "pre_reminder", channel: "sms", recipient_user_id: "u1" },
    ];
    expect(stageAlreadyFired(fired, "overdue_alert")).toBe(false);
  });

  it("returns false on empty reminders_fired", () => {
    expect(stageAlreadyFired([], "pre_reminder")).toBe(false);
  });
});

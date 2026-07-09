import { describe, it, expect } from "vitest";
import { decideReminderAction } from "@/lib/referee/closeout-reminders";

const at = (iso: string) => new Date(iso);

describe("decideReminderAction", () => {
  it("does nothing before kickoff + 2h", () => {
    expect(decideReminderAction({ now: at("2026-07-09T18:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 0 })).toBe("none");
  });
  it("sends the first reminder at kickoff + 2h when stage 0", () => {
    expect(decideReminderAction({ now: at("2026-07-09T19:30:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 0 })).toBe("send_first");
  });
  it("never reminds a completed game", () => {
    expect(decideReminderAction({ now: at("2026-07-10T13:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "completed", stage: 1 })).toBe("none");
  });
  it("sends the second reminder the next morning when stage 1", () => {
    // kickoff 2026-07-09 17:00Z; next local ET morning 8am = 2026-07-10 12:00Z (EDT, UTC-4)
    expect(decideReminderAction({ now: at("2026-07-10T12:30:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 1 })).toBe("send_second");
  });
  it("does not send the second before the next morning", () => {
    expect(decideReminderAction({ now: at("2026-07-09T20:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 1 })).toBe("none");
  });
  it("stops after stage 2", () => {
    expect(decideReminderAction({ now: at("2026-07-11T13:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 2 })).toBe("none");
  });
});

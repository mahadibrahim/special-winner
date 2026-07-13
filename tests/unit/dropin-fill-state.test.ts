import { describe, it, expect } from "vitest";
import { deriveFillState } from "@/lib/dropin/fill-state";

const base = {
  capacity: 10,
  thresholdPct: 60,
  windowHours: 24,
  startsAt: new Date("2026-07-14T23:00:00Z"),
};

describe("deriveFillState", () => {
  const soon = new Date("2026-07-14T13:00:00Z"); // 10h before — inside window
  const far = new Date("2026-07-10T13:00:00Z"); // 4+ days before — outside window

  it("full at capacity", () => {
    expect(deriveFillState({ ...base, confirmedCount: 10, now: soon })).toBe("full");
  });
  it("almost_full at >= 80%", () => {
    expect(deriveFillState({ ...base, confirmedCount: 8, now: soon })).toBe("almost_full");
  });
  it("filling between threshold and 80%", () => {
    expect(deriveFillState({ ...base, confirmedCount: 6, now: soon })).toBe("filling");
  });
  it("needs_players under threshold inside the window", () => {
    expect(deriveFillState({ ...base, confirmedCount: 3, now: soon })).toBe("needs_players");
  });
  it("open under threshold OUTSIDE the window (no urgency yet)", () => {
    expect(deriveFillState({ ...base, confirmedCount: 3, now: far })).toBe("open");
  });
  it("zero capacity reads as full", () => {
    expect(deriveFillState({ ...base, capacity: 0, confirmedCount: 0, now: soon })).toBe("full");
  });
});

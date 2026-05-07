import { describe, it, expect } from "vitest";
import {
  computeHandoffTarget,
  parseEscalationTarget,
} from "@/lib/activity-tracking/handoff";

const activity = {
  raci: { accountable: "role.venue_manager" },
  escalation_path:
    "If venue manager unreachable, escalate to role.director one level up",
};

describe("computeHandoffTarget", () => {
  it("overdue_alert → activity.raci.accountable", () => {
    expect(computeHandoffTarget(activity, "overdue_alert")).toBe(
      "role.venue_manager",
    );
  });

  it("escalation → role mentioned in escalation_path", () => {
    expect(computeHandoffTarget(activity, "escalation")).toBe("role.director");
  });

  it("final_escalation → role.director", () => {
    expect(computeHandoffTarget(activity, "final_escalation")).toBe(
      "role.director",
    );
  });

  it("pre_reminder → null (no handoff)", () => {
    expect(computeHandoffTarget(activity, "pre_reminder")).toBeNull();
  });
});

describe("parseEscalationTarget", () => {
  it("extracts role.<id> mentioned in text", () => {
    expect(
      parseEscalationTarget("escalate to role.director one level up"),
    ).toBe("role.director");
  });

  it("returns null when no role.<id> present", () => {
    expect(parseEscalationTarget("escalate to the manager")).toBeNull();
  });
});

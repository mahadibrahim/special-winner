import { describe, it, expect } from "vitest";
import { ActivitySchema } from "../../../../src/lib/ops-catalog/types/activity";

const validActivity = {
  id: "act.rainout_decision",
  name: "Rainout decision",
  description: "Make go/no-go call when weather threatens a match",
  trigger: "Weather/field condition within 2h of kickoff suggests cancellation",
  phase: "pre_game",
  sport_tags: [],
  venue_tags: ["outdoor"],
  format_tags: [],
  audience_tags: [],
  raci: {
    accountable: "role.venue_manager",
    responsible: ["role.venue_manager"],
    consulted: ["role.director"],
    informed: ["role.coach", "role.ref", "role.parent"],
  },
  automation_status: "hybrid",
  platform_features: ["feat.weather_alert_dashboard", "feat.cancellation_broadcast"],
  escalation_path: "If Venue Manager unreachable, Director makes call",
  sop_body: "1. Open admin panel.\n2. Check weather.\n3. Decide.",
  tracking_method: "form",
  tracking_artifact: { template_id: "frm.rainout_decision" },
  expected_completion: "T-90min",
};

describe("ActivitySchema", () => {
  it("accepts a fully-valid activity", () => {
    const result = ActivitySchema.safeParse(validActivity);
    expect(result.success).toBe(true);
  });

  it("rejects accountable as an array", () => {
    const bad = {
      ...validActivity,
      raci: { ...validActivity.raci, accountable: ["role.venue_manager"] },
    };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty accountable", () => {
    const bad = {
      ...validActivity,
      raci: { ...validActivity.raci, accountable: "" },
    };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects tracking_method = none", () => {
    const bad = {
      ...validActivity,
      tracking_method: "none",
      tracking_artifact: { template_id: "frm.rainout_decision" },
    };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown phase", () => {
    const bad = { ...validActivity, phase: "halftime" };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown automation_status", () => {
    const bad = { ...validActivity, automation_status: "auto" };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires tracking_artifact to match tracking_method shape", () => {
    const bad = {
      ...validActivity,
      tracking_method: "checklist",
      tracking_artifact: { event_type: "evt.match_started" },
    };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts checklist artifact with template_id", () => {
    const ok = {
      ...validActivity,
      tracking_method: "checklist",
      tracking_artifact: { template_id: "chk.field_setup" },
    };
    const result = ActivitySchema.safeParse(ok);
    expect(result.success).toBe(true);
  });

  it("accepts photo_upload artifact with media_kind + min_count", () => {
    const ok = {
      ...validActivity,
      tracking_method: "photo_upload",
      tracking_artifact: { media_kind: "field_condition", min_count: 2 },
    };
    const result = ActivitySchema.safeParse(ok);
    expect(result.success).toBe(true);
  });

  it("accepts an activity with no tools field (optional)", () => {
    const result = ActivitySchema.safeParse(validActivity);
    expect(result.success).toBe(true);
  });

  it("accepts an activity with a tools list", () => {
    const ok = {
      ...validActivity,
      tools: ["Weather app or NWS radar", "The rainout decision form (/admin/venue)"],
    };
    const result = ActivitySchema.safeParse(ok);
    expect(result.success).toBe(true);
  });

  it("rejects tools with a non-string entry", () => {
    const bad = { ...validActivity, tools: ["Weather app", 42] };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects tools with an empty string entry", () => {
    const bad = { ...validActivity, tools: [""] };
    const result = ActivitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

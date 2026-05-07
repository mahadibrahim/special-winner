import { describe, it, expect } from "vitest";
import { validateCatalog } from "../../../src/lib/ops-catalog/validator";
import type { Catalog } from "../../../src/lib/ops-catalog/loader";
import type { Activity } from "../../../src/lib/ops-catalog/types/activity";
import type { Role } from "../../../src/lib/ops-catalog/types/role";
import type { Feature } from "../../../src/lib/ops-catalog/types/feature";
import type { ArtifactTemplate } from "../../../src/lib/ops-catalog/types/artifact-template";

const venueManagerRole: Role = {
  id: "role.venue_manager",
  name: "Venue Manager",
  tier: "operational",
  kind: "worker",
  description: "Runs the venue.",
  manual_target: "employee_manual",
};

const directorRole: Role = {
  id: "role.director",
  name: "Director",
  tier: "leadership",
  kind: "worker",
  description: "Leads operations.",
  manual_target: "employee_manual",
};

const testFeature: Feature = {
  id: "feat.test",
  name: "Test Feature",
  description: "A feature used in tests.",
  priority: "P1",
  status: "shipped",
};

const testFormArtifact: ArtifactTemplate = {
  id: "frm.test",
  kind: "form",
  status: "implemented",
  fields: [{ id: "field1", label: "Field 1", type: "text", required: true }],
};

const baseActivity: Activity = {
  id: "act.test_activity",
  name: "Test Activity",
  description: "An activity used in tests.",
  trigger: "Manual trigger.",
  phase: "pre_game",
  sport_tags: [],
  venue_tags: [],
  format_tags: [],
  audience_tags: [],
  raci: {
    accountable: "role.venue_manager",
    responsible: ["role.venue_manager"],
    consulted: [],
    informed: [],
  },
  automation_status: "manual",
  platform_features: ["feat.test"],
  escalation_path: "Escalate to director.",
  sop_body: "Do the thing.",
  tracking_method: "form",
  tracking_artifact: { template_id: "frm.test" },
  expected_completion: "Within 30 minutes.",
  reminder_policy: undefined,
};

function makeValidCatalog(): Catalog {
  return {
    roles: [venueManagerRole, directorRole],
    features: [testFeature],
    artifacts: [testFormArtifact],
    activities: [structuredClone(baseActivity)],
  };
}

describe("validateCatalog", () => {
  it("returns no errors for a valid catalog", () => {
    const result = validateCatalog(makeValidCatalog());
    expect(result.errors).toEqual([]);
  });

  it("produces error for unknown role reference", () => {
    const catalog = makeValidCatalog();
    catalog.activities[0].raci.accountable = "role.does_not_exist";
    const result = validateCatalog(catalog);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some(
        (e) =>
          e.source === "act.test_activity" && /role\.does_not_exist/.test(e.message),
      ),
    ).toBe(true);
  });

  it("produces error for unknown feature reference", () => {
    const catalog = makeValidCatalog();
    catalog.activities[0].platform_features = ["feat.unknown"];
    const result = validateCatalog(catalog);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some(
        (e) =>
          e.source === "act.test_activity" && /feat\.unknown/.test(e.message),
      ),
    ).toBe(true);
  });

  it("produces error for unknown artifact template reference", () => {
    const catalog = makeValidCatalog();
    catalog.activities[0].tracking_artifact = { template_id: "frm.does_not_exist" };
    const result = validateCatalog(catalog);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some(
        (e) =>
          e.source === "act.test_activity" && /frm\.does_not_exist/.test(e.message),
      ),
    ).toBe(true);
  });

  it("produces a director warning when accountable=role.director outside post_day", () => {
    const catalog = makeValidCatalog();
    catalog.activities[0].raci.accountable = "role.director";
    catalog.activities[0].phase = "pre_game";
    const result = validateCatalog(catalog);
    expect(
      result.warnings.some(
        (w) => w.source === "act.test_activity" && /director/i.test(w.message),
      ),
    ).toBe(true);
  });

  it("does not produce a director warning when accountable=role.director and phase=post_day", () => {
    const catalog = makeValidCatalog();
    catalog.activities[0].raci.accountable = "role.director";
    catalog.activities[0].phase = "post_day";
    const result = validateCatalog(catalog);
    expect(
      result.warnings.some(
        (w) => w.source === "act.test_activity" && /director/i.test(w.message),
      ),
    ).toBe(false);
  });

  it("produces error for duplicate id within a kind", () => {
    const catalog = makeValidCatalog();
    catalog.activities.push(structuredClone(baseActivity));
    const result = validateCatalog(catalog);
    expect(
      result.errors.some(
        (e) =>
          e.source === "act.test_activity" && /duplicate id/i.test(e.message),
      ),
    ).toBe(true);
  });
});

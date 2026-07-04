import { describe, expect, it } from "vitest";
import { planUpserts, type ExistingRows, type UpsertPlan } from "@/lib/curriculum/load-helpers";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import type { SkillContent } from "@/lib/curriculum/content/types";

const EMPTY: ExistingRows = {
  domains: [],
  stages: [],
  skills: [],
  activities: [],
  templates: [],
  prompts: [],
  resources: [],
  principles: [],
};

/**
 * Converts a plan's output rows back into the ExistingRows shape a
 * subsequent planUpserts() call would read from the database, simulating
 * "the loader just applied this plan and wrote these exact rows".
 */
function simulateApplied(plan: UpsertPlan): ExistingRows {
  return {
    domains: plan.domains.rows,
    stages: plan.stages.rows,
    skills: plan.skills.rows,
    activities: plan.activities.rows,
    templates: plan.templates.rows,
    prompts: plan.prompts.rows,
    resources: plan.resources.rows,
    principles: plan.principles.rows,
  };
}

describe("planUpserts", () => {
  it("plans pure adds against an empty database", () => {
    const plan = planUpserts(CURRICULUM_CONTENT, EMPTY);
    expect(plan.skills.adds).toBe(CURRICULUM_CONTENT.skills.length);
    expect(plan.skills.updates).toBe(0);
    expect(plan.skills.unchanged).toBe(0);
    expect(plan.domains.adds).toBe(4);
    expect(plan.stages.adds).toBe(CURRICULUM_CONTENT.stages.length);
    expect(plan.activities.adds).toBe(CURRICULUM_CONTENT.activities.length);
    expect(plan.templates.adds).toBe(CURRICULUM_CONTENT.sessionPlans.length);
    expect(plan.prompts.adds).toBe(CURRICULUM_CONTENT.coachGuidance.prompts.length);
    expect(plan.resources.adds).toBe(CURRICULUM_CONTENT.coachGuidance.resources.length);
    expect(plan.principles.adds).toBe(CURRICULUM_CONTENT.coachGuidance.principles.length);
  });

  it("is idempotent: planning against its own output yields zero adds", () => {
    const first = planUpserts(CURRICULUM_CONTENT, EMPTY);
    const asExisting = simulateApplied(first);
    const second = planUpserts(CURRICULUM_CONTENT, asExisting);
    expect(second.skills.adds).toBe(0);
    expect(second.activities.adds).toBe(0);
    expect(second.domains.adds).toBe(0);
    expect(second.stages.adds).toBe(0);
    expect(second.templates.adds).toBe(0);
    expect(second.prompts.adds).toBe(0);
    expect(second.resources.adds).toBe(0);
    expect(second.principles.adds).toBe(0);

    expect(second.skills.updates).toBe(0);
    expect(second.skills.unchanged).toBe(CURRICULUM_CONTENT.skills.length);
    expect(second.activities.unchanged).toBe(CURRICULUM_CONTENT.activities.length);
    expect(second.domains.unchanged).toBe(4);
  });

  it("detects an update when a natural-key match has different content", () => {
    const first = planUpserts(CURRICULUM_CONTENT, EMPTY);
    const asExisting = simulateApplied(first);
    // Mutate one existing skill's description to simulate drift from a
    // prior load (e.g. content was hand-edited in the DB, or an older
    // pass wrote a different value).
    const mutated: ExistingRows = {
      ...asExisting,
      skills: asExisting.skills.map((s, i) =>
        i === 0 ? { ...s, description: "stale description from a prior load" } : s,
      ),
    };
    const plan = planUpserts(CURRICULUM_CONTENT, mutated);
    expect(plan.skills.adds).toBe(0);
    expect(plan.skills.updates).toBe(1);
    expect(plan.skills.unchanged).toBe(CURRICULUM_CONTENT.skills.length - 1);
  });

  it("scopes skill/activity/template natural keys by sport (same slug, different sport is not a match)", () => {
    const existing: ExistingRows = {
      ...EMPTY,
      skills: [
        {
          slug: "shared-slug",
          name: "Some Skill",
          sport: "basketball",
          domain: "technical",
          stage: "fundamentals",
        } satisfies SkillContent,
      ],
    };
    const content = {
      ...CURRICULUM_CONTENT,
      skills: [
        {
          slug: "shared-slug",
          name: "Some Skill",
          sport: "soccer",
          domain: "technical",
          stage: "fundamentals",
        } satisfies SkillContent,
      ],
      activities: [],
      sessionPlans: [],
    };
    const plan = planUpserts(content, existing);
    // Different sport => different natural key => this is an add, not an
    // update, even though the slug collides.
    expect(plan.skills.adds).toBe(1);
    expect(plan.skills.updates).toBe(0);
  });
});

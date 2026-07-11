import { describe, expect, it } from "vitest";
import {
  planUpserts,
  partitionForeignOwnership,
  normalizeActivityForCompare,
  normalizePrincipleForCompare,
  normalizePromptForCompare,
  normalizeResourceForCompare,
  normalizeSkillForCompare,
  normalizeTemplateForCompare,
  type ExistingRows,
  type OwnershipRow,
  type UpsertPlan,
} from "@/lib/curriculum/load-helpers";
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
 *
 * Critically, this runs each row through the SAME normalize*ForCompare
 * function scripts/curriculum-load.ts's write path defaults mirror -- a real
 * DB round-trip materializes column defaults (e.g. `skills.is_core DEFAULT
 * false`) for any field the content omitted, so `readExistingRows` never
 * hands `planUpserts` a row with an absent key. Without this, the
 * idempotency test below never exercised the code path that produced the
 * Finding 1 phantom-update bug: it compared raw content rows against raw
 * content rows, which always matched even when the real loader would have
 * diffed content-with-omitted-field against DB-with-defaulted-field.
 */
function simulateApplied(plan: UpsertPlan): ExistingRows {
  return {
    domains: plan.domains.rows,
    stages: plan.stages.rows,
    skills: plan.skills.rows.map(normalizeSkillForCompare),
    activities: plan.activities.rows.map(normalizeActivityForCompare),
    templates: plan.templates.rows.map(normalizeTemplateForCompare),
    prompts: plan.prompts.rows.map(normalizePromptForCompare),
    resources: plan.resources.rows.map(normalizeResourceForCompare),
    principles: plan.principles.rows.map(normalizePrincipleForCompare),
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

  it("regression (Finding 1): a skill omitting assessmentMethod/isCore/sortOrder plans as unchanged, not update, on a second pass", () => {
    // "coordination" (basketball) is a real registry entry that omits all
    // three optional fields -- this is the exact case the reviewer
    // confirmed live on staging (8 soccer + 7 basketball skills reporting
    // phantom updates on every re-run). The original fixture ("passing")
    // was dropped as a near-duplicate of "passing-short" during the
    // pre-load curriculum consolidation; a second fixture
    // ("dribbling-with-speed", soccer) was completed with these fields
    // during the 2026-07-11 soccer depth pass, so this swaps in a
    // basketball skill that still omits them rather than deleting the
    // test. If content authoring ever starts specifying these fields
    // explicitly for "coordination" too, swap in another skill that omits
    // them rather than deleting this test.
    const passing = CURRICULUM_CONTENT.skills.find(
      (s) => s.sport === "basketball" && s.slug === "coordination",
    );
    if (!passing) {
      throw new Error(
        'fixture drifted: expected basketball skill "coordination" to exist',
      );
    }
    expect(passing.assessmentMethod).toBeUndefined();
    expect(passing.isCore).toBeUndefined();
    expect(passing.sortOrder).toBeUndefined();

    const content = {
      ...CURRICULUM_CONTENT,
      skills: [passing],
      activities: [],
      sessionPlans: [],
    };

    const first = planUpserts(content, EMPTY);
    expect(first.skills.adds).toBe(1);

    // Simulate the loader writing this row, the DB materializing
    // assessment_method/is_core/sort_order's column defaults, and a second
    // invocation reading it back via readExistingRows.
    const asExisting = simulateApplied(first);
    const second = planUpserts(content, asExisting);
    expect(second.skills.adds).toBe(0);
    expect(second.skills.updates).toBe(0);
    expect(second.skills.unchanged).toBe(1);
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

// Final review Finding 4: running the loader for a second org must not
// silently re-scope (steal) coach_prompts/coach_resources rows a different
// org's earlier run already created, since their natural key is global.
describe("partitionForeignOwnership", () => {
  const ORG_A = "11111111-1111-1111-1111-111111111111";
  const ORG_B = "22222222-2222-2222-2222-222222222222";

  it("skips nothing when every row is already owned by the target org", () => {
    const rows: OwnershipRow[] = [
      { key: "prompt-1", organizationId: ORG_A },
      { key: "prompt-2", organizationId: ORG_A },
    ];
    const result = partitionForeignOwnership(rows, ORG_A, false);
    expect(result.skipKeys.size).toBe(0);
    expect(result.foreignOrgCounts.size).toBe(0);
  });

  it("skips nothing for rows with no owner yet (organizationId: null)", () => {
    const rows: OwnershipRow[] = [{ key: "prompt-1", organizationId: null }];
    const result = partitionForeignOwnership(rows, ORG_A, false);
    expect(result.skipKeys.size).toBe(0);
    expect(result.foreignOrgCounts.size).toBe(0);
  });

  it("flags rows owned by a different org as skip-worthy and counts them per foreign org", () => {
    const rows: OwnershipRow[] = [
      { key: "prompt-1", organizationId: ORG_B },
      { key: "prompt-2", organizationId: ORG_A },
      { key: "prompt-3", organizationId: ORG_B },
    ];
    const result = partitionForeignOwnership(rows, ORG_A, false);
    expect(result.skipKeys).toEqual(new Set(["prompt-1", "prompt-3"]));
    expect(result.foreignOrgCounts.get(ORG_B)).toBe(2);
    expect(result.foreignOrgCounts.has(ORG_A)).toBe(false);
  });

  it("--steal-guidance (allowSteal=true) still reports foreign-org counts but skips nothing", () => {
    const rows: OwnershipRow[] = [{ key: "prompt-1", organizationId: ORG_B }];
    const result = partitionForeignOwnership(rows, ORG_A, true);
    expect(result.skipKeys.size).toBe(0);
    expect(result.foreignOrgCounts.get(ORG_B)).toBe(1);
  });
});

// Pure age-guardrail evaluator for the Program Blueprint feature (see
// "Age guardrails (two-tier)" in
// docs/superpowers/specs/2026-07-10-program-blueprint-design.md).
//
// No DB access anywhere in this module -- callers (the blueprint UI's
// bootstrap endpoint, the sequence-entry write endpoint, and the
// distribution/attach endpoint) resolve rows and feed in plain data, which
// is what makes this unit-testable and keeps the rules evaluated from a
// single source (safety-rules.ts) rather than duplicated client-side.
//
// Two tiers:
//   - BLOCK: a skill flagged in safety-rules.ts whose minAge sits above the
//     season's youngest player. Hard-stop; never dismissible.
//   - WARN: an activity tagged with appropriateStages that shares no stage
//     with the season's age band (ordinary curriculum-fit skew, not a
//     safety issue). Visible but dismissible; never blocks distribution.

import { STAGES } from "./content/reference";
import { getSafetyRule } from "./safety-rules";

/**
 * Curriculum stage slugs whose [ageMin, ageMax] overlaps the given band.
 * Age bands are read directly from src/lib/curriculum/content/reference.ts
 * STAGES (the same reference data the curriculum registry validates
 * against) rather than a duplicated map, so stage boundaries can only ever
 * drift from that one source of truth. Returned in stage sortOrder.
 */
export function mapAgeBandToStages(minAge: number, maxAge: number): string[] {
  return STAGES.filter((stage) => stage.ageMin <= maxAge && stage.ageMax >= minAge).map(
    (stage) => stage.slug,
  );
}

/** "Skill Building (ages 9–10)" -- plain-language stage label for warn copy. */
function stageLabel(slug: string): string {
  const stage = STAGES.find((s) => s.slug === slug);
  if (!stage) return slug;
  return `${stage.name} (ages ${stage.ageMin}–${stage.ageMax})`;
}

function joinLabels(slugs: string[]): string {
  return slugs.map(stageLabel).join(" or ");
}

export interface GuardrailSkillInput {
  slug: string;
  name: string;
  introductionAge: number | null;
}

export interface GuardrailActivityInput {
  name: string;
  /** Curriculum stage slugs this activity is written for, or null when
   * the activity carries no stage tagging (never warned on). */
  appropriateStages: string[] | null;
  skills: GuardrailSkillInput[];
}

export interface GuardrailInput {
  seasonMinAge: number | null;
  seasonMaxAge: number | null;
  activities: GuardrailActivityInput[];
}

export interface GuardrailBlock {
  activityName: string;
  skillName: string;
  reason: string;
  rule: string;
  source: string;
}

export interface GuardrailWarn {
  activityName: string;
  reason: string;
}

export interface GuardrailResult {
  /** false when the season has no age band set at all -- callers show a
   * "can't evaluate guardrails" notice rather than guessing. */
  evaluable: boolean;
  blocks: GuardrailBlock[];
  warns: GuardrailWarn[];
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const { seasonMinAge, seasonMaxAge, activities } = input;

  if (seasonMinAge === null && seasonMaxAge === null) {
    return { evaluable: false, blocks: [], warns: [] };
  }

  // One-sided bands (only one bound known) evaluate against that single
  // age -- never invented, always caller-supplied.
  const effectiveMin = seasonMinAge ?? (seasonMaxAge as number);
  const effectiveMax = seasonMaxAge ?? (seasonMinAge as number);

  const seasonStageSlugs = mapAgeBandToStages(effectiveMin, effectiveMax);

  const blocks: GuardrailBlock[] = [];
  const warns: GuardrailWarn[] = [];

  for (const activity of activities) {
    for (const skill of activity.skills) {
      const rule = getSafetyRule(skill.slug);
      // A season "including any age below the rule age" blocks -- the
      // youngest player in the group is what matters, not the average.
      if (rule && effectiveMin < rule.minAge) {
        blocks.push({
          activityName: activity.name,
          skillName: skill.name,
          reason: `${skill.name} drills are blocked for ages under ${rule.minAge}`,
          rule: rule.rule,
          source: rule.source,
        });
      }
    }

    if (activity.appropriateStages !== null) {
      const overlaps = activity.appropriateStages.some((slug) =>
        seasonStageSlugs.includes(slug),
      );
      if (!overlaps) {
        const activityLabel = activity.appropriateStages.length
          ? joinLabels(activity.appropriateStages)
          : "no listed stage";
        const seasonLabel = seasonStageSlugs.length
          ? joinLabels(seasonStageSlugs)
          : `ages ${effectiveMin}–${effectiveMax}`;
        warns.push({
          activityName: activity.name,
          reason: `This activity is written for ${activityLabel}; this group is ${seasonLabel}.`,
        });
      }
    }
  }

  return { evaluable: true, blocks, warns };
}

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
import { CURRICULUM_CONTENT } from "./content";
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
  /** false when the season has no age band set at all (both bounds null)
   * -- callers show a "can't evaluate guardrails" notice for the warn tier
   * rather than guessing a stage-overlap. This does NOT mean `blocks` is
   * always empty in that case -- see the fail-closed contract below. */
  evaluable: boolean;
  blocks: GuardrailBlock[];
  warns: GuardrailWarn[];
}

/**
 * Evaluate BLOCK (safety) and WARN (stage-fit) guardrails for a season's
 * age band against a set of activities/skills.
 *
 * Fail-closed contract for the BLOCK tier: the youngest player in the group
 * is what matters, and an unknown floor is treated as "could be younger
 * than the rule allows" -- never as "assume it's fine":
 *   - `seasonMinAge` known and below a skill's safety-rule `minAge` -> BLOCK.
 *   - `seasonMinAge` is `null` (floor unknown) and a safety-ruled skill is
 *     present -> BLOCK, regardless of whether `seasonMaxAge` is set. A
 *     known ceiling says nothing about the youngest kid in the room.
 *   - `seasonMinAge` known and at/above the rule's `minAge` -> no block.
 * This fail-closed check runs even when `evaluable` is `false` (both bounds
 * null) -- "we can't evaluate the warn tier" is not the same claim as "it's
 * safe to run this drill." `evaluable` only gates the WARN tier, which has
 * no meaningful null-band behavior (nothing to compare stage overlap
 * against).
 */
export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const { seasonMinAge, seasonMaxAge, activities } = input;

  const evaluable = seasonMinAge !== null || seasonMaxAge !== null;

  // One-sided bands (only one bound known) evaluate the WARN tier against
  // that single age -- never invented, always caller-supplied. Only
  // computed when there's a band at all; the WARN tier has nothing to do
  // when both bounds are null.
  let seasonStageSlugs: string[] = [];
  let warnLabelMin = 0;
  let warnLabelMax = 0;
  if (evaluable) {
    warnLabelMin = seasonMinAge ?? (seasonMaxAge as number);
    warnLabelMax = seasonMaxAge ?? (seasonMinAge as number);
    seasonStageSlugs = mapAgeBandToStages(warnLabelMin, warnLabelMax);
  }

  const blocks: GuardrailBlock[] = [];
  const warns: GuardrailWarn[] = [];

  for (const activity of activities) {
    for (const skill of activity.skills) {
      const rule = getSafetyRule(skill.slug);
      if (!rule) continue;

      if (seasonMinAge === null) {
        // Floor unknown -- fail closed regardless of seasonMaxAge. A known
        // ceiling of 15 says nothing about whether the youngest player is 8.
        blocks.push({
          activityName: activity.name,
          skillName: skill.name,
          reason: `This group's youngest age isn't set — ${skill.name} drills are blocked until an age range confirms all players are ${rule.minAge}+`,
          rule: rule.rule,
          source: rule.source,
        });
      } else if (seasonMinAge < rule.minAge) {
        // A season "including any age below the rule age" blocks -- the
        // youngest player in the group is what matters, not the average.
        blocks.push({
          activityName: activity.name,
          skillName: skill.name,
          reason: `${skill.name} drills are blocked for ages under ${rule.minAge}`,
          rule: rule.rule,
          source: rule.source,
        });
      }
    }

    if (evaluable && activity.appropriateStages !== null) {
      const overlaps = activity.appropriateStages.some((slug) =>
        seasonStageSlugs.includes(slug),
      );
      if (!overlaps) {
        const activityLabel = activity.appropriateStages.length
          ? joinLabels(activity.appropriateStages)
          : "no listed stage";
        const seasonLabel = seasonStageSlugs.length
          ? joinLabels(seasonStageSlugs)
          : `ages ${warnLabelMin}–${warnLabelMax}`;
        warns.push({
          activityName: activity.name,
          reason: `This activity is written for ${activityLabel}; this group is ${seasonLabel}.`,
        });
      }
    }
  }

  return { evaluable, blocks, warns };
}

/**
 * Resolve free-text `activitySuggestions` strings (authored on practice
 * templates) against the curriculum registry (`CURRICULUM_CONTENT`),
 * matching each string case-insensitively by activity `slug` OR activity
 * `name`. Returns the union of matched activities' `skillsDeveloped` skill
 * slugs; unmatched/garbage strings contribute nothing.
 *
 * Why this exists: `focusSkillIds` is the structured, DB-validated way a
 * template declares the skills it develops, and that's what the safety
 * block tier evaluates. But templates also carry free-text
 * `activitySuggestions` per segment -- a coach or admin can type "Heading
 * Progression" there without ever touching `focusSkillIds`, silently
 * smuggling a safety-ruled activity past the block tier. Resolving those
 * strings against the registry closes that gap.
 */
export function resolveSuggestionSkillSlugs(
  suggestions: string[] | null | undefined,
): string[] {
  if (!suggestions || suggestions.length === 0) return [];

  const normalized = new Set(
    suggestions.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0),
  );
  if (normalized.size === 0) return [];

  const matchedSkillSlugs = new Set<string>();
  for (const activity of CURRICULUM_CONTENT.activities) {
    const isMatch =
      normalized.has(activity.slug.toLowerCase()) ||
      normalized.has(activity.name.toLowerCase());
    if (!isMatch) continue;
    for (const skillSlug of activity.skillsDeveloped ?? []) {
      matchedSkillSlugs.add(skillSlug);
    }
  }
  return [...matchedSkillSlugs];
}

export interface GuardrailTemplateInput {
  name: string;
  focusSkillIds: string[] | null;
  structure: { activitySuggestions?: string[] }[] | null;
}

/**
 * Build a `GuardrailActivityInput` for one practice template: merges its
 * structured `focusSkillIds` with skills resolved from free-text
 * `activitySuggestions` (via `resolveSuggestionSkillSlugs` +
 * `resolveSkillInputsForSlugs`), so a safety-flagged activity can't be
 * smuggled past the block tier just by typing it into a segment instead of
 * wiring it up as a focus skill (T2/T3 review finding #3).
 *
 * This is the single template -> activity-input resolution used by every
 * guardrail call site (entries.ts at sequence-entry write time,
 * templates/[id].ts on template edit, and the distribution engine's
 * attach/attach-preview safety re-check) — do not re-derive this merge
 * logic locally at a new call site.
 *
 * `skillsById` is caller-supplied (a DB lookup keyed by `focusSkillIds`
 * values) since this module makes no DB calls itself.
 */
export function buildGuardrailActivityInput(
  template: GuardrailTemplateInput,
  skillsById: Map<string, { slug: string; name: string }>,
): GuardrailActivityInput {
  const focusSkills = (template.focusSkillIds ?? [])
    .map((sid) => skillsById.get(sid))
    .filter((s): s is { slug: string; name: string } => !!s)
    .map((s) => ({ slug: s.slug, name: s.name, introductionAge: null }));

  const suggestionSlugs = resolveSuggestionSkillSlugs(
    (template.structure ?? []).flatMap((seg) => seg.activitySuggestions ?? []),
  );
  const suggestionSkills = resolveSkillInputsForSlugs(suggestionSlugs);

  const seenSlugs = new Set(focusSkills.map((s) => s.slug));
  const mergedSkills = [
    ...focusSkills,
    ...suggestionSkills.filter((s) => !seenSlugs.has(s.slug)),
  ];

  // Templates carry no stage tagging of their own (that lives on
  // `activities` rows, which templates don't reference by FK) -- warn tier
  // doesn't apply at the template level, only the safety block tier.
  return { name: template.name, appropriateStages: null, skills: mergedSkills };
}

/**
 * Resolve skill slugs (e.g. from `resolveSuggestionSkillSlugs`) to
 * `GuardrailSkillInput` records using the registry's `name`/
 * `introductionAge`. These skills may have no corresponding DB `skills`
 * row at all -- they were matched from free-text against registry
 * activities, not looked up by id -- so `evaluateGuardrails` is fed the
 * registry's own name/introductionAge rather than a joined DB row.
 * Unknown slugs are dropped (shouldn't happen given the slugs came from
 * the registry itself, but never invented).
 */
export function resolveSkillInputsForSlugs(slugs: string[]): GuardrailSkillInput[] {
  const seen = new Set<string>();
  const result: GuardrailSkillInput[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const skill = CURRICULUM_CONTENT.skills.find((s) => s.slug === slug);
    if (!skill) continue;
    result.push({
      slug: skill.slug,
      name: skill.name,
      introductionAge: skill.introductionAge ?? null,
    });
  }
  return result;
}

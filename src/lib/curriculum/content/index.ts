import { DOMAINS, STAGES } from "./reference";
import type { CurriculumContent } from "./types";

// Skills, activities, and session plans start empty here — Tasks 3-7 fill
// them in by sport. coachGuidance starts empty for the same reason.
export const CURRICULUM_CONTENT: CurriculumContent = {
  domains: DOMAINS,
  stages: STAGES,
  skills: [],
  activities: [],
  sessionPlans: [],
  coachGuidance: { prompts: [], resources: [], principles: [] },
};

/**
 * Validates internal consistency of the curriculum content registry.
 * Returns an array of human-readable violation messages; empty means valid.
 */
export function validateRegistry(content: CurriculumContent): string[] {
  const violations: string[] = [];

  const domainNames = new Set(content.domains.map((d) => d.name));
  const stageSlugs = new Set(content.stages.map((s) => s.slug));

  // skill slugs unique per sport
  const skillKeySeen = new Set<string>();
  const skillSlugsBySport = new Map<string, Set<string>>();
  for (const skill of content.skills) {
    const key = `${skill.sport}::${skill.slug}`;
    if (skillKeySeen.has(key)) {
      violations.push(`Duplicate skill slug "${skill.slug}" for sport "${skill.sport}"`);
    }
    skillKeySeen.add(key);

    if (!skillSlugsBySport.has(skill.sport)) {
      skillSlugsBySport.set(skill.sport, new Set());
    }
    skillSlugsBySport.get(skill.sport)!.add(skill.slug);

    // every SkillContent.domain ∈ domains
    if (!domainNames.has(skill.domain)) {
      violations.push(
        `Skill "${skill.slug}" (${skill.sport}) references unknown domain "${skill.domain}"`,
      );
    }

    // every SkillContent.stage ∈ stage slugs
    if (!stageSlugs.has(skill.stage)) {
      violations.push(
        `Skill "${skill.slug}" (${skill.sport}) references unknown stage "${skill.stage}"`,
      );
    }
  }

  // activity slugs unique per sport
  const activityKeySeen = new Set<string>();
  for (const activity of content.activities) {
    const key = `${activity.sport}::${activity.slug}`;
    if (activityKeySeen.has(key)) {
      violations.push(
        `Duplicate activity slug "${activity.slug}" for sport "${activity.sport}"`,
      );
    }
    activityKeySeen.add(key);

    // every ActivityContent.skillsDeveloped entry resolves to a skill slug of the same sport
    const sportSkillSlugs = skillSlugsBySport.get(activity.sport) ?? new Set<string>();
    for (const skillSlug of activity.skillsDeveloped ?? []) {
      if (!sportSkillSlugs.has(skillSlug)) {
        violations.push(
          `Activity "${activity.slug}" (${activity.sport}) references unknown skill "${skillSlug}"`,
        );
      }
    }

    // every appropriateStages entry resolves
    for (const stageSlug of activity.appropriateStages ?? []) {
      if (!stageSlugs.has(stageSlug)) {
        violations.push(
          `Activity "${activity.slug}" (${activity.sport}) references unknown stage "${stageSlug}"`,
        );
      }
    }
  }

  // session plan sports valid (must have at least one skill or activity for that sport,
  // or at minimum reference a stage that exists if one is set)
  const knownSports = new Set([
    ...content.skills.map((s) => s.sport),
    ...content.activities.map((a) => a.sport),
  ]);
  for (const plan of content.sessionPlans) {
    if (!knownSports.has(plan.sport)) {
      violations.push(
        `Session plan "${plan.name}" references unknown sport "${plan.sport}" (no skills or activities defined for it)`,
      );
    }
    if (plan.stage && !stageSlugs.has(plan.stage)) {
      violations.push(
        `Session plan "${plan.name}" references unknown stage "${plan.stage}"`,
      );
    }
  }

  return violations;
}

import { DOMAINS, STAGES } from "./reference";
import { SOCCER_SKILLS } from "./soccer/skills";
import { SOCCER_ACTIVITIES } from "./soccer/activities";
import { SOCCER_SESSION_PLANS } from "./soccer/session-plans";
import { BASKETBALL_SKILLS } from "./basketball/skills";
import { BASKETBALL_ACTIVITIES } from "./basketball/activities";
import { BASKETBALL_SESSION_PLANS } from "./basketball/session-plans";
import { HOCKEY_SKILLS } from "./hockey/skills";
import { HOCKEY_ACTIVITIES } from "./hockey/activities";
import { HOCKEY_SESSION_PLANS } from "./hockey/session-plans";
import { BASEBALL_SKILLS } from "./baseball/skills";
import { COACH_GUIDANCE } from "./coach-guidance";
import type { CurriculumContent } from "./types";

// Hockey now has an originally-authored activities library AND session-plan
// library (wave-2 refine, see ./hockey/activities.ts and
// ./hockey/session-plans.ts headers for sourcing/provenance) alongside its
// transcribed skills. Baseball still has skills only -- no activities/session
// plans exist in the recovered seeds for it, and inventing them remains out
// of scope per the plan's Global Constraints, Refinery backlog per spec §8.
export const CURRICULUM_CONTENT: CurriculumContent = {
  domains: DOMAINS,
  stages: STAGES,
  skills: [
    ...SOCCER_SKILLS,
    ...BASKETBALL_SKILLS,
    ...HOCKEY_SKILLS,
    ...BASEBALL_SKILLS,
  ],
  activities: [...SOCCER_ACTIVITIES, ...BASKETBALL_ACTIVITIES, ...HOCKEY_ACTIVITIES],
  sessionPlans: [
    ...SOCCER_SESSION_PLANS,
    ...BASKETBALL_SESSION_PLANS,
    ...HOCKEY_SESSION_PLANS,
  ],
  coachGuidance: COACH_GUIDANCE,
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
      violations.push(
        `Duplicate skill slug "${skill.slug}" for sport "${skill.sport}"`,
      );
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
    const sportSkillSlugs =
      skillSlugsBySport.get(activity.sport) ?? new Set<string>();
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

  // coach guidance: sport/stage slug references resolve, and natural keys
  // (coach_prompts.content, coach_resources.title, coaching_principles.title
  // -- see src/lib/db/schema/coach-guidance.ts) are unique.
  const sportSlugs = new Set(knownSports);
  const checkSportStage = (row: Record<string, unknown>, label: string) => {
    if (typeof row.sport === "string" && !sportSlugs.has(row.sport)) {
      violations.push(`${label} references unknown sport "${row.sport}"`);
    }
    if (typeof row.stage === "string" && !stageSlugs.has(row.stage)) {
      violations.push(`${label} references unknown stage "${row.stage}"`);
    }
  };

  const promptContentSeen = new Set<string>();
  for (const prompt of content.coachGuidance.prompts) {
    const contentText = prompt.content;
    if (typeof contentText === "string") {
      if (promptContentSeen.has(contentText)) {
        violations.push(
          `Duplicate coach prompt content (natural key): "${contentText.slice(0, 60)}..."`,
        );
      }
      promptContentSeen.add(contentText);
    }
    checkSportStage(prompt, `Coach prompt "${String(prompt.title ?? contentText)}"`);
  }

  const resourceTitleSeen = new Set<string>();
  for (const resource of content.coachGuidance.resources) {
    const title = resource.title;
    if (typeof title === "string") {
      if (resourceTitleSeen.has(title)) {
        violations.push(`Duplicate coach resource title (natural key): "${title}"`);
      }
      resourceTitleSeen.add(title);
    }
    checkSportStage(resource, `Coach resource "${String(title)}"`);
  }

  const principleTitleSeen = new Set<string>();
  for (const principle of content.coachGuidance.principles) {
    const title = principle.title;
    if (typeof title === "string") {
      if (principleTitleSeen.has(title)) {
        violations.push(`Duplicate coaching principle title (natural key): "${title}"`);
      }
      principleTitleSeen.add(title);
    }
    checkSportStage(principle, `Coaching principle "${String(title)}"`);
  }

  return violations;
}

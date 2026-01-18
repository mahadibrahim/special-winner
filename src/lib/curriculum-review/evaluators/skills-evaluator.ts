/**
 * Skills Evaluator
 *
 * Evaluates skill content against the research-based skills rubric.
 */

import { BaseEvaluator } from "./base-evaluator";
import { skillsRubric } from "../rubrics/skills-rubric";
import type { ReviewResult, SkillContent } from "../types";

export class SkillsEvaluator extends BaseEvaluator {
  constructor() {
    super(skillsRubric);
  }

  /**
   * Evaluate a skill against the rubric
   */
  evaluate(content: unknown): ReviewResult {
    const skill = content as SkillContent;

    // Apply all criteria
    const criteriaScores = this.applyCriteria(skill);

    // Detect anti-patterns and best practices
    const antiPatterns = this.detectAntiPatterns(skill);
    const bestPractices = this.detectBestPractices(skill);

    // Build and return result
    return this.buildResult(
      "skill",
      skill.id,
      skill.name,
      skill.sport?.name,
      criteriaScores,
      antiPatterns,
      bestPractices
    );
  }
}

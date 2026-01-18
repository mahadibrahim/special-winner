/**
 * Curriculum Review Module
 *
 * Research-based curriculum quality evaluation system.
 *
 * Aligned with:
 * - European Models: TDEQ-5, YPD, Danish ATDE
 * - American Models: Double-Goal Coach, ELM Feedback, Project Play, US Soccer PDI
 */

// Types
export * from "./types";

// Rubrics
export { skillsRubric } from "./rubrics/skills-rubric";

// Evaluators
export { BaseEvaluator } from "./evaluators/base-evaluator";
export { SkillsEvaluator } from "./evaluators/skills-evaluator";

// Report Generator
export {
  buildReport,
  generateMarkdownReport,
  generateJsonReport,
} from "./report-generator";

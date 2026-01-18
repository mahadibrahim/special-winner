/**
 * Curriculum Review Runner
 *
 * Executes the curriculum quality review process:
 * 1. Fetches all curriculum content from the database
 * 2. Evaluates each item against research-based rubrics
 * 3. Stores results in curriculum_reviews table
 * 4. Generates markdown and JSON reports
 *
 * Run with: npx tsx src/lib/db/seeds/curriculum-review/run-review.ts
 */

import { db } from "../../index";
import { skills, curriculumReviews } from "../../schema";
import { eq } from "drizzle-orm";
import { SkillsEvaluator } from "../../../curriculum-review/evaluators/skills-evaluator";
import {
  buildReport,
  generateMarkdownReport,
  generateJsonReport,
} from "../../../curriculum-review/report-generator";
import type { ReviewResult } from "../../../curriculum-review/types";
import { writeFileSync } from "fs";
import { sql } from "drizzle-orm";

// ============================================================================
// MAIN REVIEW FUNCTION
// ============================================================================

async function runCurriculumReview() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CURRICULUM QUALITY REVIEW");
  console.log("  Research-Based Evaluation System");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const results: ReviewResult[] = [];

  try {
    // Ensure table exists
    await ensureTableExists();

    // Clear previous reviews
    console.log("Clearing previous reviews...");
    await db.delete(curriculumReviews);
    console.log("  ✓ Previous reviews cleared\n");

    // Review skills
    console.log("Reviewing Skills...");
    console.log("─────────────────────────────────────────────────────────────────");
    const skillResults = await reviewSkills();
    results.push(...skillResults);
    console.log(`  ✓ Reviewed ${skillResults.length} skills\n`);

    // TODO: Review activities (add when activities rubric is created)
    // console.log("Reviewing Activities...");
    // const activityResults = await reviewActivities();
    // results.push(...activityResults);

    // TODO: Review session plans (add when session plans rubric is created)
    // console.log("Reviewing Session Plans...");
    // const sessionPlanResults = await reviewSessionPlans();
    // results.push(...sessionPlanResults);

    // Build report
    console.log("Generating Reports...");
    console.log("─────────────────────────────────────────────────────────────────");
    const report = buildReport(results);

    // Save markdown report
    const mdReport = generateMarkdownReport(report);
    writeFileSync("curriculum-review-report.md", mdReport);
    console.log("  ✓ Saved curriculum-review-report.md");

    // Save JSON report
    const jsonReport = generateJsonReport(report);
    writeFileSync("curriculum-review-report.json", jsonReport);
    console.log("  ✓ Saved curriculum-review-report.json\n");

    // Print summary
    printSummary(report);

  } catch (error) {
    console.error("❌ Error running curriculum review:", error);
    throw error;
  }
}

// ============================================================================
// ENSURE TABLE EXISTS
// ============================================================================

async function ensureTableExists() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curriculum_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_type VARCHAR(50) NOT NULL,
        content_id UUID NOT NULL,
        content_name VARCHAR(255) NOT NULL,
        sport_name VARCHAR(100),
        reviewed_at TIMESTAMP DEFAULT NOW() NOT NULL,
        reviewer_type VARCHAR(50) DEFAULT 'automated' NOT NULL,
        reviewer_id UUID,
        overall_score DECIMAL(3,2) NOT NULL,
        criteria_scores JSONB NOT NULL,
        anti_patterns_found JSONB,
        best_practices_found JSONB,
        strengths JSONB,
        improvements_needed JSONB,
        priority_fixes JSONB,
        status VARCHAR(50) DEFAULT 'completed' NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_curriculum_reviews_content
      ON curriculum_reviews(content_type, content_id)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_curriculum_reviews_score
      ON curriculum_reviews(overall_score)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_curriculum_reviews_sport
      ON curriculum_reviews(sport_name)
    `);

    console.log("  ✓ curriculum_reviews table ready\n");
  } catch (error) {
    console.log("  ✓ curriculum_reviews table exists\n");
  }
}

// ============================================================================
// REVIEW SKILLS
// ============================================================================

async function reviewSkills(): Promise<ReviewResult[]> {
  const evaluator = new SkillsEvaluator();
  const results: ReviewResult[] = [];

  // Fetch all active skills with relations
  const allSkills = await db.query.skills.findMany({
    where: eq(skills.active, true),
    with: {
      sport: true,
      domain: true,
      stage: true,
    },
  });

  console.log(`  Found ${allSkills.length} active skills to review`);

  for (const skill of allSkills) {
    try {
      // Evaluate skill
      const result = evaluator.evaluate(skill);
      results.push(result);

      // Save to database
      await db.insert(curriculumReviews).values({
        contentType: result.contentType,
        contentId: result.contentId,
        contentName: result.contentName,
        sportName: result.sportName,
        overallScore: result.overallScore.toString(),
        criteriaScores: result.criteriaScores,
        antiPatternsFound: result.antiPatternsFound,
        bestPracticesFound: result.bestPracticesFound,
        strengths: result.strengths,
        improvementsNeeded: result.improvementsNeeded,
        priorityFixes: result.priorityFixes,
        status: "completed",
      });

      // Print progress
      const scoreEmoji =
        result.overallScore >= 4 ? "+" : result.overallScore < 3 ? "-" : " ";
      console.log(
        `    ${scoreEmoji} ${skill.name}: ${result.overallScore.toFixed(2)}/5.00`
      );
    } catch (error) {
      console.error(`    ✗ Error evaluating ${skill.name}:`, error);

      // Save error to database
      await db.insert(curriculumReviews).values({
        contentType: "skill",
        contentId: skill.id,
        contentName: skill.name,
        sportName: skill.sport?.name,
        overallScore: "0",
        criteriaScores: {},
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// ============================================================================
// PRINT SUMMARY
// ============================================================================

function printSummary(report: ReturnType<typeof buildReport>) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  REVIEW COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Summary:");
  console.log(`  Total Items Reviewed: ${report.summary.totalReviewed}`);
  console.log(`  Average Score: ${report.summary.averageScore.toFixed(2)}/5.00`);
  console.log("");

  // By content type
  console.log("By Content Type:");
  for (const [type, stats] of Object.entries(report.summary.byContentType)) {
    console.log(
      `  ${type}: ${stats.count} items, avg ${stats.avgScore.toFixed(2)}, ${stats.needsAttentionCount} need attention`
    );
  }
  console.log("");

  // By sport
  console.log("By Sport:");
  for (const [sport, stats] of Object.entries(report.summary.bySport)) {
    console.log(`  ${sport}: ${stats.count} items, avg ${stats.avgScore.toFixed(2)}`);
  }
  console.log("");

  // Anti-patterns found
  if (report.summary.commonAntiPatterns.length > 0) {
    console.log("Anti-Patterns Found:");
    for (const { pattern, count } of report.summary.commonAntiPatterns) {
      console.log(`  - ${pattern}: ${count} occurrence(s)`);
    }
    console.log("");
  }

  // Best practices found
  if (report.summary.commonBestPractices.length > 0) {
    console.log("Best Practices Found:");
    for (const { practice, count } of report.summary.commonBestPractices) {
      console.log(`  + ${practice}: ${count} occurrence(s)`);
    }
    console.log("");
  }

  // Items needing attention
  if (report.summary.needsAttention.length > 0) {
    console.log(`Items Needing Attention (${report.summary.needsAttention.length}):`);
    for (const item of report.summary.needsAttention.slice(0, 5)) {
      console.log(`  - ${item.contentName}: ${item.overallScore.toFixed(2)}`);
    }
    if (report.summary.needsAttention.length > 5) {
      console.log(`  ... and ${report.summary.needsAttention.length - 5} more`);
    }
    console.log("");
  }

  // Lowest scoring criteria
  const sortedCriteria = Object.entries(report.summary.criterionAverages)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5);

  if (sortedCriteria.length > 0) {
    console.log("Lowest Scoring Criteria (areas to improve):");
    for (const [criterion, avg] of sortedCriteria) {
      console.log(`  - ${criterion}: ${avg.toFixed(2)}`);
    }
    console.log("");
  }

  console.log("Reports saved:");
  console.log("  - curriculum-review-report.md (human-readable)");
  console.log("  - curriculum-review-report.json (machine-readable)");
  console.log("");
}

// ============================================================================
// RUN
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runCurriculumReview()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { runCurriculumReview };

/**
 * Report Generator
 *
 * Generates markdown and JSON reports from curriculum review results.
 */

import type {
  ReviewResult,
  ReviewReport,
  ReviewReportSummary,
  ContentType,
  ContentTypeSummary,
} from "./types";

/**
 * Build a complete review report from individual results
 */
export function buildReport(results: ReviewResult[]): ReviewReport {
  const summary = buildSummary(results);

  return {
    generatedAt: new Date(),
    summary,
    details: results,
  };
}

/**
 * Build summary statistics from results
 */
function buildSummary(results: ReviewResult[]): ReviewReportSummary {
  if (results.length === 0) {
    return {
      totalReviewed: 0,
      averageScore: 0,
      byContentType: {} as Record<ContentType, ContentTypeSummary>,
      bySport: {},
      topPerformers: [],
      needsAttention: [],
      commonAntiPatterns: [],
      commonBestPractices: [],
      criterionAverages: {},
    };
  }

  // Calculate overall average
  const averageScore =
    results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;

  // Group by content type
  const byContentType = {} as Record<ContentType, ContentTypeSummary>;
  const contentTypes: ContentType[] = ["skill", "activity", "session_plan"];

  for (const type of contentTypes) {
    const typeResults = results.filter((r) => r.contentType === type);
    if (typeResults.length > 0) {
      const scores = typeResults.map((r) => r.overallScore);
      byContentType[type] = {
        count: typeResults.length,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        needsAttentionCount: typeResults.filter((r) => r.overallScore < 3.5).length,
      };
    }
  }

  // Group by sport
  const bySport: Record<string, { count: number; avgScore: number }> = {};
  for (const result of results) {
    const sport = result.sportName || "Unknown";
    if (!bySport[sport]) {
      bySport[sport] = { count: 0, avgScore: 0 };
    }
    bySport[sport].count++;
    bySport[sport].avgScore += result.overallScore;
  }
  // Calculate averages
  for (const sport of Object.keys(bySport)) {
    bySport[sport].avgScore = bySport[sport].avgScore / bySport[sport].count;
  }

  // Top performers (score >= 4)
  const topPerformers = results
    .filter((r) => r.overallScore >= 4)
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10);

  // Needs attention (score < 3.5)
  const needsAttention = results
    .filter((r) => r.overallScore < 3.5)
    .sort((a, b) => a.overallScore - b.overallScore);

  // Common anti-patterns
  const antiPatternCounts: Record<string, number> = {};
  for (const result of results) {
    for (const ap of result.antiPatternsFound) {
      antiPatternCounts[ap.pattern] = (antiPatternCounts[ap.pattern] || 0) + 1;
    }
  }
  const commonAntiPatterns = Object.entries(antiPatternCounts)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  // Common best practices
  const bestPracticeCounts: Record<string, number> = {};
  for (const result of results) {
    for (const bp of result.bestPracticesFound) {
      bestPracticeCounts[bp.practice] = (bestPracticeCounts[bp.practice] || 0) + 1;
    }
  }
  const commonBestPractices = Object.entries(bestPracticeCounts)
    .map(([practice, count]) => ({ practice, count }))
    .sort((a, b) => b.count - a.count);

  // Criterion averages
  const criterionTotals: Record<string, { sum: number; count: number }> = {};
  for (const result of results) {
    for (const [key, score] of Object.entries(result.criteriaScores)) {
      if (!criterionTotals[key]) {
        criterionTotals[key] = { sum: 0, count: 0 };
      }
      criterionTotals[key].sum += score.score;
      criterionTotals[key].count++;
    }
  }
  const criterionAverages: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(criterionTotals)) {
    criterionAverages[key] = Math.round((sum / count) * 100) / 100;
  }

  return {
    totalReviewed: results.length,
    averageScore: Math.round(averageScore * 100) / 100,
    byContentType,
    bySport,
    topPerformers,
    needsAttention,
    commonAntiPatterns,
    commonBestPractices,
    criterionAverages,
  };
}

/**
 * Generate a markdown report
 */
export function generateMarkdownReport(report: ReviewReport): string {
  const lines: string[] = [];

  lines.push("# Curriculum Quality Review Report");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt.toISOString()}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Items Reviewed:** ${report.summary.totalReviewed}`);
  lines.push(`- **Average Score:** ${report.summary.averageScore.toFixed(2)}/5.00`);
  lines.push("");

  // By content type
  lines.push("### By Content Type");
  lines.push("");
  lines.push("| Type | Count | Avg Score | Min | Max | Needs Attention |");
  lines.push("|------|-------|-----------|-----|-----|-----------------|");

  for (const [type, stats] of Object.entries(report.summary.byContentType)) {
    lines.push(
      `| ${type} | ${stats.count} | ${stats.avgScore.toFixed(2)} | ${stats.minScore.toFixed(2)} | ${stats.maxScore.toFixed(2)} | ${stats.needsAttentionCount} |`
    );
  }
  lines.push("");

  // By sport
  if (Object.keys(report.summary.bySport).length > 0) {
    lines.push("### By Sport");
    lines.push("");
    lines.push("| Sport | Count | Avg Score |");
    lines.push("|-------|-------|-----------|");

    for (const [sport, stats] of Object.entries(report.summary.bySport)) {
      lines.push(`| ${sport} | ${stats.count} | ${stats.avgScore.toFixed(2)} |`);
    }
    lines.push("");
  }

  // Criterion averages
  if (Object.keys(report.summary.criterionAverages).length > 0) {
    lines.push("### Criterion Averages");
    lines.push("");
    lines.push("| Criterion | Avg Score |");
    lines.push("|-----------|-----------|");

    const sorted = Object.entries(report.summary.criterionAverages).sort(
      (a, b) => a[1] - b[1]
    );
    for (const [criterion, avg] of sorted) {
      const emoji = avg >= 4 ? "+" : avg < 3 ? "-" : "";
      lines.push(`| ${criterion} | ${avg.toFixed(2)} ${emoji} |`);
    }
    lines.push("");
  }

  // Common anti-patterns
  if (report.summary.commonAntiPatterns.length > 0) {
    lines.push("### Anti-Patterns Found");
    lines.push("");
    for (const { pattern, count } of report.summary.commonAntiPatterns) {
      lines.push(`- **${pattern}**: ${count} occurrence(s)`);
    }
    lines.push("");
  }

  // Common best practices
  if (report.summary.commonBestPractices.length > 0) {
    lines.push("### Best Practices Found");
    lines.push("");
    for (const { practice, count } of report.summary.commonBestPractices) {
      lines.push(`- **${practice}**: ${count} occurrence(s)`);
    }
    lines.push("");
  }

  // Items needing attention
  if (report.summary.needsAttention.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Items Needing Attention (Score < 3.5)");
    lines.push("");

    for (const item of report.summary.needsAttention) {
      lines.push(`### ${item.contentName} (${item.contentType})`);
      lines.push("");
      lines.push(`**Score:** ${item.overallScore.toFixed(2)}/5.00`);
      if (item.sportName) {
        lines.push(`**Sport:** ${item.sportName}`);
      }
      lines.push("");

      if (item.priorityFixes.length > 0) {
        lines.push("**Priority Fixes:**");
        lines.push("");
        for (const fix of item.priorityFixes) {
          lines.push(`- **${fix.criterion}** (${fix.priority})`);
          lines.push(`  - Issue: ${fix.issue}`);
          lines.push(`  - Suggestion: ${fix.suggestion}`);
          if (fix.frameworkSource) {
            lines.push(`  - Source: ${fix.frameworkSource}`);
          }
        }
        lines.push("");
      }

      if (item.antiPatternsFound.length > 0) {
        lines.push("**Anti-Patterns:**");
        lines.push("");
        for (const ap of item.antiPatternsFound) {
          lines.push(`- ${ap.pattern} (${ap.source}): ${ap.evidence}`);
        }
        lines.push("");
      }
    }
  }

  // Top performers
  if (report.summary.topPerformers.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Top Performers (Score >= 4.0)");
    lines.push("");
    lines.push("| Name | Type | Sport | Score | Best Practices |");
    lines.push("|------|------|-------|-------|----------------|");

    for (const item of report.summary.topPerformers) {
      const bpList = item.bestPracticesFound.map((bp) => bp.practice).join(", ") || "-";
      lines.push(
        `| ${item.contentName} | ${item.contentType} | ${item.sportName || "-"} | ${item.overallScore.toFixed(2)} | ${bpList} |`
      );
    }
    lines.push("");
  }

  // Full details section
  lines.push("---");
  lines.push("");
  lines.push("## Full Details");
  lines.push("");

  for (const item of report.details) {
    lines.push(`### ${item.contentName}`);
    lines.push("");
    lines.push(`- **Type:** ${item.contentType}`);
    lines.push(`- **Sport:** ${item.sportName || "N/A"}`);
    lines.push(`- **Score:** ${item.overallScore.toFixed(2)}/5.00`);
    lines.push("");

    // Criteria scores
    lines.push("**Criteria Scores:**");
    lines.push("");
    const sortedCriteria = Object.entries(item.criteriaScores).sort(
      (a, b) => a[1].score - b[1].score
    );
    for (const [key, score] of sortedCriteria) {
      const emoji = score.score >= 4 ? "+" : score.score < 3 ? "-" : "";
      lines.push(`- ${key}: ${score.score}/5 ${emoji}`);
    }
    lines.push("");

    // Strengths
    if (item.strengths.length > 0) {
      lines.push("**Strengths:**");
      for (const strength of item.strengths.slice(0, 5)) {
        lines.push(`- ${strength}`);
      }
      lines.push("");
    }

    // Improvements
    if (item.improvementsNeeded.length > 0) {
      lines.push("**Improvements Needed:**");
      for (const imp of item.improvementsNeeded.slice(0, 5)) {
        lines.push(`- [${imp.priority}] ${imp.criterion}: ${imp.suggestion}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a JSON report
 */
export function generateJsonReport(report: ReviewReport): string {
  return JSON.stringify(report, null, 2);
}

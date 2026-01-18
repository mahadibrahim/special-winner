/**
 * Base Evaluator
 *
 * Abstract base class for curriculum content evaluation.
 * Provides common functionality for applying rubrics, detecting patterns,
 * and generating improvement suggestions.
 */

import type {
  Rubric,
  ReviewResult,
  CriterionScore,
  ImprovementSuggestion,
  AntiPatternResult,
  BestPracticeResult,
  ContentType,
  ScoreLevel,
  Priority,
} from "../types";

export abstract class BaseEvaluator {
  protected rubric: Rubric;

  constructor(rubric: Rubric) {
    this.rubric = rubric;
  }

  /**
   * Main evaluation method - must be implemented by subclasses
   */
  abstract evaluate(content: unknown): ReviewResult;

  /**
   * Calculate weighted score from criteria scores
   */
  protected calculateWeightedScore(
    criteriaScores: Record<string, CriterionScore>
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const score of Object.values(criteriaScores)) {
      weightedSum += score.score * score.weight;
      totalWeight += score.weight;
    }

    // Normalize to ensure weights sum to 1
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Apply all criteria from the rubric
   */
  protected applyCriteria(content: unknown): Record<string, CriterionScore> {
    const scores: Record<string, CriterionScore> = {};

    for (const criterion of this.rubric.criteria) {
      try {
        scores[criterion.key] = criterion.evaluate(content);
      } catch (error) {
        // If evaluation fails, give neutral score
        scores[criterion.key] = {
          score: 3,
          weight: criterion.weight,
          notes: `Evaluation error: ${error instanceof Error ? error.message : "Unknown error"}`,
          frameworkSource: criterion.frameworkSource,
        };
      }
    }

    return scores;
  }

  /**
   * Detect anti-patterns and calculate penalties
   */
  protected detectAntiPatterns(content: unknown): AntiPatternResult[] {
    const found: AntiPatternResult[] = [];

    for (const antiPattern of this.rubric.antiPatterns) {
      const evidence = antiPattern.detectFn(content);
      if (evidence) {
        found.push({
          pattern: antiPattern.pattern,
          penalty: antiPattern.penalty,
          source: antiPattern.source,
          evidence,
        });
      }
    }

    return found;
  }

  /**
   * Detect best practices and calculate bonuses
   */
  protected detectBestPractices(content: unknown): BestPracticeResult[] {
    const found: BestPracticeResult[] = [];

    for (const bestPractice of this.rubric.bestPractices) {
      const evidence = bestPractice.detectFn(content);
      if (evidence) {
        found.push({
          practice: bestPractice.practice,
          bonus: bestPractice.bonus,
          source: bestPractice.source,
          evidence,
        });
      }
    }

    return found;
  }

  /**
   * Apply penalties and bonuses to base score
   */
  protected applyAdjustments(
    baseScore: number,
    antiPatterns: AntiPatternResult[],
    bestPractices: BestPracticeResult[]
  ): number {
    const totalPenalty = antiPatterns.reduce((sum, ap) => sum + ap.penalty, 0);
    const totalBonus = bestPractices.reduce((sum, bp) => sum + bp.bonus, 0);

    // Apply adjustments, clamping to 1-5 range
    let adjustedScore = baseScore - totalPenalty + totalBonus;
    adjustedScore = Math.max(1, Math.min(5, adjustedScore));

    return Math.round(adjustedScore * 100) / 100; // Round to 2 decimals
  }

  /**
   * Identify strengths from high-scoring criteria
   */
  protected identifyStrengths(
    criteriaScores: Record<string, CriterionScore>,
    bestPractices: BestPracticeResult[]
  ): string[] {
    const strengths: string[] = [];

    // Add high-scoring criteria as strengths
    for (const [key, score] of Object.entries(criteriaScores)) {
      if (score.score >= 4) {
        const criterion = this.rubric.criteria.find((c) => c.key === key);
        if (criterion) {
          strengths.push(
            `${criterion.name}: ${score.notes}${score.frameworkSource ? ` (${score.frameworkSource})` : ""}`
          );
        }
      }
    }

    // Add best practices found
    for (const bp of bestPractices) {
      strengths.push(`${bp.practice} (${bp.source})`);
    }

    return strengths;
  }

  /**
   * Generate improvement suggestions for low-scoring criteria
   */
  protected generateImprovements(
    criteriaScores: Record<string, CriterionScore>
  ): ImprovementSuggestion[] {
    const improvements: ImprovementSuggestion[] = [];

    // Sort criteria by score (lowest first) and weight (highest first)
    const sortedCriteria = Object.entries(criteriaScores)
      .map(([key, score]) => ({
        key,
        score,
        criterion: this.rubric.criteria.find((c) => c.key === key),
      }))
      .filter((item) => item.criterion && item.score.score < 4)
      .sort((a, b) => {
        // First by score (ascending)
        if (a.score.score !== b.score.score) {
          return a.score.score - b.score.score;
        }
        // Then by weight (descending)
        return b.score.weight - a.score.weight;
      });

    for (const { key, score, criterion } of sortedCriteria) {
      if (!criterion) continue;

      const priority = this.getPriority(score.score as ScoreLevel, score.weight);
      const suggestion = criterion.getImprovementSuggestion(score.score as ScoreLevel);

      improvements.push({
        criterion: criterion.name,
        issue: score.notes,
        suggestion,
        priority,
        frameworkSource: criterion.frameworkSource,
      });
    }

    return improvements;
  }

  /**
   * Determine priority based on score and weight
   */
  protected getPriority(score: ScoreLevel, weight: number): Priority {
    // High priority: very low score or low score with high weight
    if (score <= 1) return "high";
    if (score === 2 && weight >= 0.08) return "high";

    // Medium priority: score of 2-3
    if (score <= 3) return "medium";

    // Low priority: score of 4 (still room for improvement)
    return "low";
  }

  /**
   * Get top 3 priority fixes
   */
  protected getPriorityFixes(improvements: ImprovementSuggestion[]): ImprovementSuggestion[] {
    // Already sorted by importance, take top 3
    return improvements.slice(0, 3);
  }

  /**
   * Build complete review result
   */
  protected buildResult(
    contentType: ContentType,
    contentId: string,
    contentName: string,
    sportName: string | undefined,
    criteriaScores: Record<string, CriterionScore>,
    antiPatterns: AntiPatternResult[],
    bestPractices: BestPracticeResult[]
  ): ReviewResult {
    const baseScore = this.calculateWeightedScore(criteriaScores);
    const overallScore = this.applyAdjustments(baseScore, antiPatterns, bestPractices);
    const strengths = this.identifyStrengths(criteriaScores, bestPractices);
    const improvementsNeeded = this.generateImprovements(criteriaScores);
    const priorityFixes = this.getPriorityFixes(improvementsNeeded);

    return {
      contentType,
      contentId,
      contentName,
      sportName,
      overallScore,
      criteriaScores,
      antiPatternsFound: antiPatterns,
      bestPracticesFound: bestPractices,
      strengths,
      improvementsNeeded,
      priorityFixes,
    };
  }
}

/**
 * Curriculum Review Types
 *
 * Type definitions for the curriculum quality review system.
 * Aligned with research frameworks:
 * - European: TDEQ-5, YPD, Danish ATDE
 * - American: Double-Goal Coach, ELM Feedback, Project Play, US Soccer PDI
 */

// ============================================================================
// SCORING TYPES
// ============================================================================

export type ScoreLevel = 1 | 2 | 3 | 4 | 5;

export interface CriterionScore {
  score: ScoreLevel;
  weight: number; // 0-1 (percentage as decimal)
  notes: string;
  evidence?: string[];
  frameworkSource?: string;
}

export interface CriterionDefinition {
  name: string;
  key: string;
  weight: number;
  description: string;
  frameworkSource: string;
  evaluate: (content: unknown) => CriterionScore;
  getImprovementSuggestion: (score: ScoreLevel) => string;
}

// ============================================================================
// RESEARCH ALIGNMENT TYPES
// ============================================================================

export interface AntiPattern {
  pattern: string;
  penalty: number;
  source: string;
  detectFn: (content: unknown) => string | null; // Returns evidence if found, null otherwise
}

export interface BestPractice {
  practice: string;
  bonus: number;
  source: string;
  detectFn: (content: unknown) => string | null; // Returns evidence if found, null otherwise
}

export interface AntiPatternResult {
  pattern: string;
  penalty: number;
  source: string;
  evidence: string;
}

export interface BestPracticeResult {
  practice: string;
  bonus: number;
  source: string;
  evidence: string;
}

// ============================================================================
// IMPROVEMENT SUGGESTION TYPES
// ============================================================================

export type Priority = "high" | "medium" | "low";

export interface ImprovementSuggestion {
  criterion: string;
  issue: string;
  suggestion: string;
  priority: Priority;
  exampleFix?: string;
  frameworkSource?: string;
}

// ============================================================================
// REVIEW RESULT TYPES
// ============================================================================

export type ContentType = "skill" | "activity" | "session_plan";

export interface ReviewResult {
  contentType: ContentType;
  contentId: string;
  contentName: string;
  sportName?: string;
  overallScore: number;
  criteriaScores: Record<string, CriterionScore>;
  antiPatternsFound: AntiPatternResult[];
  bestPracticesFound: BestPracticeResult[];
  strengths: string[];
  improvementsNeeded: ImprovementSuggestion[];
  priorityFixes: ImprovementSuggestion[];
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface ContentTypeSummary {
  count: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  needsAttentionCount: number;
}

export interface SportSummary {
  count: number;
  avgScore: number;
}

export interface CriterionSummary {
  avgScore: number;
  lowestScoring: string[];
}

export interface ReviewReportSummary {
  totalReviewed: number;
  averageScore: number;
  byContentType: Record<ContentType, ContentTypeSummary>;
  bySport: Record<string, SportSummary>;
  topPerformers: ReviewResult[];
  needsAttention: ReviewResult[];
  commonAntiPatterns: Array<{ pattern: string; count: number }>;
  commonBestPractices: Array<{ practice: string; count: number }>;
  criterionAverages: Record<string, number>;
}

export interface ReviewReport {
  generatedAt: Date;
  summary: ReviewReportSummary;
  details: ReviewResult[];
}

// ============================================================================
// RUBRIC TYPES
// ============================================================================

export interface Rubric {
  name: string;
  contentType: ContentType;
  criteria: CriterionDefinition[];
  antiPatterns: AntiPattern[];
  bestPractices: BestPractice[];
}

// ============================================================================
// SKILL-SPECIFIC TYPES (for type-safe evaluation)
// ============================================================================

export interface SkillComprehensiveGuide {
  levelDetails?: Record<
    number,
    {
      name: string;
      description: string;
      observableBehaviors: string[];
      commonMistakes: string[];
      coachingTips: string[];
      assessmentActivities: string[];
    }
  >;
  ageExpectations?: {
    ages6to8?: { typicalLevel: string; notes: string };
    ages9to11?: { typicalLevel: string; notes: string };
    ages12to14?: { typicalLevel: string; notes: string };
  };
  redFlags?: string[];
  parentExplanation?: string;
  homeActivities?: string[];
  bestAssessedIn?: string[];
  assessmentFrequency?: string;
  assessmentDuration?: string;
}

export interface SkillContent {
  id: string;
  name: string;
  description?: string | null;
  progressionLevels?: Record<number, string> | null;
  observableBehaviors?: string[] | null;
  commonMistakes?: string[] | null;
  coachingTips?: string[] | null;
  tags?: string[] | null;
  comprehensiveGuide?: SkillComprehensiveGuide | null;
  sport?: { name: string } | null;
  domain?: { name: string } | null;
  stage?: { name: string } | null;
}

// ============================================================================
// ACTIVITY-SPECIFIC TYPES
// ============================================================================

export interface ActivityComprehensiveGuide {
  quickReference?: {
    oneSentence: string;
    keyPhrases: string[];
    setupDiagram?: string;
    quickProgression?: { easier: string; harder: string };
  };
  completeScript?: {
    beforeYouStart?: {
      preparation: string[];
      mindset: string;
    };
    segments?: Array<{
      phase: string;
      duration: string;
      coachPosition?: string;
      script: string;
      anticipatedResponses?: Record<string, string>;
      troubleshooting?: Record<string, string[]>;
    }>;
  };
  troubleshooting?: {
    gameBalance?: Record<string, { symptoms: string[]; solutions: string[] }>;
    playerBehavior?: Record<string, { symptoms: string[]; solutions: string[] }>;
    environmentalIssues?: Record<string, { symptoms: string[]; solutions: string[] }>;
  };
  skillConnections?: {
    primarySkills?: Array<{
      skill: string;
      domain: string;
      howItDevelops: string;
      levelIndicators?: Record<number, string>;
      assessmentNotes?: string;
    }>;
    secondarySkills?: string[];
  };
  developmentalContext?: {
    whyThisActivity?: string;
    whenToUseIt?: {
      idealFor: string[];
      avoidWhen: string[];
    };
    progressionPath?: {
      before: string[];
      after: string[];
    };
    ageAdaptations?: Record<
      string,
      {
        approach: string;
        keyPhrases: string[];
        avoidSaying?: string[];
        duration?: string;
        simplifications?: string[];
        challenges?: string[];
      }
    >;
    commonMisconceptions?: Record<string, string>;
  };
  parentCommunication?: {
    ifAsked?: string;
    newsletter?: string;
    whatToWatchFor?: string[];
  };
  safety?: {
    commonRisks?: Array<{
      risk: string;
      prevention: string;
      response: string;
    }>;
    inclusionConsiderations?: Record<string, string>;
  };
  coachReflection?: {
    afterActivity?: string[];
    forImprovement?: string[];
  };
}

export interface ActivityContent {
  id: string;
  name: string;
  description?: string | null;
  howToPlay?: string | null;
  setupInstructions?: string | null;
  coachingPoints?: string[] | null;
  questionsToAsk?: string[] | null;
  variations?: Array<{ name: string; description: string; difficulty?: string }> | null;
  makeEasier?: string | null;
  makeHarder?: string | null;
  durationMinutes?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  equipment?: string[] | null;
  comprehensiveGuide?: ActivityComprehensiveGuide | null;
  sport?: { name: string } | null;
  stage?: { name: string } | null;
  activityType?: string | null;
}

// ============================================================================
// SESSION PLAN-SPECIFIC TYPES
// ============================================================================

export interface SessionPlanSegment {
  order: number;
  name: string;
  type: string;
  durationMinutes: number;
  activityId?: string;
  activityName?: string;
  notes?: string;
}

export interface SessionPlanContent {
  id: string;
  title: string;
  durationMinutes?: number | null;
  segments?: SessionPlanSegment[] | null;
  focusSkillIds?: string[] | null;
  objectives?: string[] | null;
  equipmentNeeded?: string[] | null;
  preSessionNotes?: string | null;
  postSessionReflection?: string | null;
  team?: { name: string } | null;
  sport?: { name: string } | null;
}

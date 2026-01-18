import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Curriculum Reviews Table
 *
 * Stores quality assessment results for curriculum content (skills, activities, session plans).
 * Reviews evaluate content against research-based rubrics aligned with:
 * - European Models: TDEQ-5, YPD, Danish ATDE framework
 * - American Models: Double-Goal Coach, ELM Feedback, Project Play, US Soccer PDI
 */
export const curriculumReviews = pgTable(
  "curriculum_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // What was reviewed
    contentType: varchar("content_type", { length: 50 }).notNull(), // 'skill', 'activity', 'session_plan'
    contentId: uuid("content_id").notNull(),
    contentName: varchar("content_name", { length: 255 }).notNull(),
    sportName: varchar("sport_name", { length: 100 }), // For filtering by sport

    // Review metadata
    reviewedAt: timestamp("reviewed_at").defaultNow().notNull(),
    reviewerType: varchar("reviewer_type", { length: 50 })
      .default("automated")
      .notNull(), // 'automated', 'human'
    reviewerId: uuid("reviewer_id"), // null for automated, user_id for human

    // Scores
    overallScore: decimal("overall_score", { precision: 3, scale: 2 }).notNull(), // 1.00 to 5.00
    criteriaScores: jsonb("criteria_scores")
      .notNull()
      .$type<Record<string, CriterionScoreData>>(),

    // Research alignment
    antiPatternsFound: jsonb("anti_patterns_found").$type<AntiPatternData[]>(),
    bestPracticesFound: jsonb("best_practices_found").$type<BestPracticeData[]>(),

    // Feedback
    strengths: jsonb("strengths").$type<string[]>(),
    improvementsNeeded: jsonb("improvements_needed").$type<ImprovementData[]>(),
    priorityFixes: jsonb("priority_fixes").$type<ImprovementData[]>(),

    // Status
    status: varchar("status", { length: 50 }).default("completed").notNull(), // 'pending', 'completed', 'error'
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_curriculum_reviews_content").on(
      table.contentType,
      table.contentId
    ),
    index("idx_curriculum_reviews_score").on(table.overallScore),
    index("idx_curriculum_reviews_sport").on(table.sportName),
  ]
);

// Type definitions for JSONB fields
export interface CriterionScoreData {
  score: number; // 1-5
  weight: number; // 0-1
  notes: string;
  evidence?: string[];
  frameworkSource?: string; // e.g., "YPD Model", "Double-Goal Coach"
}

export interface AntiPatternData {
  pattern: string;
  penalty: number;
  source: string;
  evidence: string;
}

export interface BestPracticeData {
  practice: string;
  bonus: number;
  source: string;
  evidence: string;
}

export interface ImprovementData {
  criterion: string;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
  exampleFix?: string;
  frameworkSource?: string;
}

// Type exports
export type CurriculumReview = typeof curriculumReviews.$inferSelect;
export type NewCurriculumReview = typeof curriculumReviews.$inferInsert;

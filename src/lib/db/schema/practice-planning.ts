import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { sports } from "./sports";
import { teams } from "./teams";
import { developmentStages, skills } from "./curriculum";
import { organizations } from "./organizations";
import { sequenceAttachments } from "./blueprint";

// Enums
export const sessionStatusEnum = pgEnum("session_status", [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const activityDifficultyEnum = pgEnum("activity_difficulty", [
  "beginner",
  "intermediate",
  "advanced",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "warmup",
  "technical",
  "tactical",
  "game",
  "scrimmage",
  "conditioning",
  "cooldown",
  "fun",
]);

// Practice Templates (reusable session structures)
export const practiceTemplates = pgTable(
  "practice_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }), // null = global template
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => developmentStages.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    totalDurationMinutes: integer("total_duration_minutes").notNull(),
    // Template structure with segment definitions
    structure: jsonb("structure").$type<
      {
        name: string;
        type: string;
        durationMinutes: number;
        description?: string;
        activitySuggestions?: string[];
        // v2 session plans script the coaching per segment (see
        // docs/curriculum/content-architecture.md "Script the Coaching")
        coachingScript?: string;
      }[]
    >(),
    focusSkillIds: uuid("focus_skill_ids").array(), // Skills this template focuses on
    equipmentNeeded: jsonb("equipment_needed").$type<string[]>(),
    coachingNotes: text("coaching_notes"),
    isDefault: boolean("is_default").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the idempotent curriculum loader (Task 8): a template
    // is identified by which sport it belongs to + its name.
    uniqueIndex("practice_templates_sport_name_uniq").on(table.sportId, table.name),
  ],
);

// Activities (game/drill library)
export const activities = pgTable(
  "activities",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }), // null = global activity
  sportId: uuid("sport_id")
    .notNull()
    .references(() => sports.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  activityType: activityTypeEnum("activity_type").default("technical").notNull(),
  difficulty: activityDifficultyEnum("difficulty").default("beginner").notNull(),
  // Player requirements
  minPlayers: integer("min_players").default(1).notNull(),
  maxPlayers: integer("max_players"),
  durationMinutes: integer("duration_minutes").notNull(),
  // Skills this activity develops
  skillsDeveloped: uuid("skills_developed").array(),
  // Setup and instructions
  setupInstructions: text("setup_instructions"),
  howToPlay: text("how_to_play").notNull(),
  diagram: text("diagram"), // URL to diagram/image or SVG content
  videoUrl: text("video_url"),
  // Coaching guidance
  coachingPoints: jsonb("coaching_points").$type<string[]>(),
  questionsToAsk: jsonb("questions_to_ask").$type<string[]>(), // European-style coaching questions
  commonMistakes: jsonb("common_mistakes").$type<string[]>(),
  // Progressions and variations
  variations: jsonb("variations").$type<
    {
      name: string;
      description: string;
      difficulty: string;
    }[]
  >(),
  makeEasier: text("make_easier"),
  makeHarder: text("make_harder"),
  // Equipment and space
  equipmentNeeded: jsonb("equipment_needed").$type<string[]>(),
  spaceRequired: varchar("space_required", { length: 100 }), // 'small', 'medium', 'full field'
  indoorSuitable: boolean("indoor_suitable").default(true).notNull(),
  // Age/stage appropriateness
  appropriateStageIds: uuid("appropriate_stage_ids").array(),
  // Metadata
  source: varchar("source", { length: 255 }), // Where this activity came from
  tags: jsonb("tags").$type<string[]>(),
  featured: boolean("featured").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  averageRating: integer("average_rating"), // 1-5 from coach feedback
  // Enhanced comprehensive content for print-ready coaching guides
  comprehensiveGuide: jsonb("comprehensive_guide").$type<{
    // Quick reference for experienced coaches
    quickReference?: {
      oneSentence: string;
      keyPhrases: string[];
      setupDiagram: string;
      quickProgression: { easier: string; harder: string };
    };
    // Minute-by-minute coaching script
    completeScript?: {
      beforeYouStart: {
        preparation: string[];
        mindset: string;
      };
      segments: Array<{
        phase: string;
        duration: string;
        coachPosition: string;
        script: string;
        anticipatedResponses?: Record<string, string>;
        troubleshooting?: Record<string, string[]>;
      }>;
    };
    // If X happens, do Y
    troubleshooting?: {
      gameBalance?: Record<string, { symptoms: string[]; solutions: string[] }>;
      playerBehavior?: Record<string, { symptoms: string[]; approach: string }>;
      environmentalIssues?: Record<string, { symptom?: string; symptoms?: string[]; solution?: string; solutions?: string[] }>;
      technicalIssues?: Record<string, { symptoms: string[]; solutions: string[] }>;
      conditionIssues?: Record<string, { symptoms?: string[]; solutions?: string[]; solution?: string }>;
      groupIssues?: Record<string, { symptoms: string[]; solutions: string[] }>;
    };
    // Connection to skill assessments
    skillConnections?: {
      primarySkills: Array<{
        skill: string;
        domain: string;
        howItDevelops: string;
        levelIndicators: Record<number, string>;
        assessmentNotes?: string;
      }>;
      secondarySkills?: Array<{
        skill: string;
        domain: string;
        howItDevelops: string;
        levelIndicators?: Record<number, string>;
      }>;
      physicalDevelopment?: Record<string, string>;
      psychologicalDevelopment?: Record<string, string>;
    };
    // Where this fits in development
    developmentalContext?: {
      whyThisActivity: string;
      whenToUseIt: { idealFor: string[]; avoidWhen: string[] };
      progressionPath: {
        before: Array<{ activity: string; reason: string }>;
        after: Array<{ activity: string; reason: string }>;
      };
      ageAdaptations: Record<string, {
        approach: string;
        keyPhrases: string[];
        avoidSaying?: string[];
        duration?: string;
        simplifications?: string[];
        challenges?: string[];
        coachRole?: string;
      }>;
      commonMisconceptions?: Record<string, string>;
    };
    // What to tell parents
    parentCommunication?: {
      ifAsked: string;
      newsletter: string;
      whatToWatchFor: string[];
    };
    // Safety and inclusion
    safety?: {
      commonRisks: Array<{ risk: string; prevention: string; response: string }>;
      inclusionConsiderations: Record<string, string>;
    };
    // Coach self-reflection
    coachReflection?: {
      afterActivity: string[];
      forImprovement: string[];
    };
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the idempotent curriculum loader (Task 8): an
    // activity is identified by which sport it belongs to + its slug.
    uniqueIndex("activities_sport_slug_uniq").on(table.sportId, table.slug),
  ],
);

// Session Plans (specific practice sessions)
export const sessionPlans = pgTable(
  "session_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => practiceTemplates.id, {
      onDelete: "set null",
    }),
    coachUserId: uuid("coach_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    scheduledDate: timestamp("scheduled_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: sessionStatusEnum("status").default("draft").notNull(),
    // Session structure with activities
    segments: jsonb("segments").$type<
      {
        order: number;
        name: string;
        type: string;
        durationMinutes: number;
        activityId?: string;
        activityName?: string;
        notes?: string;
      }[]
    >(),
    focusSkillIds: uuid("focus_skill_ids").array(),
    objectives: jsonb("objectives").$type<string[]>(),
    equipmentNeeded: jsonb("equipment_needed").$type<string[]>(),
    preSessionNotes: text("pre_session_notes"),
    // Post-session reflection
    postSessionReflection: text("post_session_reflection"),
    whatWorkedWell: text("what_worked_well"),
    whatToImprove: text("what_to_improve"),
    playerObservations: text("player_observations"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    // Program Blueprint: marks this session as prescribed (distributed
    // from a curriculum sequence) and keys it to the distribution event.
    // templateId alone can't distinguish "distributed" from "coach happened
    // to pick the same template" — nullable, set null on attachment delete
    // (the session itself survives; it just stops being "prescribed").
    sequenceAttachmentId: uuid("sequence_attachment_id").references(
      () => sequenceAttachments.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("session_plans_sequence_attachment_idx").on(
      table.sequenceAttachmentId,
    ),
    // Prescribed-session dedupe (Program Blueprint T4 hardening): a
    // distribution run and a concurrent double-POST of the same run can
    // otherwise race two inserts for the identical (team, template, date)
    // triple past the pre-check existingKeys read. Partial — scoped to
    // sequenceAttachmentId IS NOT NULL so coach-created sessions (null
    // attachment) may still legitimately repeat a template on a date.
    uniqueIndex("session_plans_prescribed_dedupe_uniq")
      .on(table.teamId, table.templateId, table.scheduledDate)
      .where(sql`sequence_attachment_id IS NOT NULL`),
  ],
);

// Session Activity Usage (tracking which activities were used in sessions)
export const sessionActivityUsage = pgTable("session_activity_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionPlanId: uuid("session_plan_id")
    .notNull()
    .references(() => sessionPlans.id, { onDelete: "cascade" }),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  segmentOrder: integer("segment_order").notNull(),
  durationMinutes: integer("duration_minutes"),
  coachRating: integer("coach_rating"), // 1-5 how well it worked
  coachNotes: text("coach_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity Ratings (coach feedback on activities)
export const activityRatings = pgTable("activity_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  coachUserId: uuid("coach_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  review: text("review"),
  ageGroupUsed: varchar("age_group_used", { length: 50 }),
  wouldUseAgain: boolean("would_use_again"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const practiceTemplatesRelations = relations(practiceTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [practiceTemplates.organizationId],
    references: [organizations.id],
  }),
  sport: one(sports, {
    fields: [practiceTemplates.sportId],
    references: [sports.id],
  }),
  stage: one(developmentStages, {
    fields: [practiceTemplates.stageId],
    references: [developmentStages.id],
  }),
  sessionPlans: many(sessionPlans),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [activities.organizationId],
    references: [organizations.id],
  }),
  sport: one(sports, {
    fields: [activities.sportId],
    references: [sports.id],
  }),
  sessionUsages: many(sessionActivityUsage),
  ratings: many(activityRatings),
}));

export const sessionPlansRelations = relations(sessionPlans, ({ one, many }) => ({
  team: one(teams, {
    fields: [sessionPlans.teamId],
    references: [teams.id],
  }),
  template: one(practiceTemplates, {
    fields: [sessionPlans.templateId],
    references: [practiceTemplates.id],
  }),
  coach: one(users, {
    fields: [sessionPlans.coachUserId],
    references: [users.id],
  }),
  activityUsages: many(sessionActivityUsage),
}));

export const sessionActivityUsageRelations = relations(sessionActivityUsage, ({ one }) => ({
  sessionPlan: one(sessionPlans, {
    fields: [sessionActivityUsage.sessionPlanId],
    references: [sessionPlans.id],
  }),
  activity: one(activities, {
    fields: [sessionActivityUsage.activityId],
    references: [activities.id],
  }),
}));

export const activityRatingsRelations = relations(activityRatings, ({ one }) => ({
  activity: one(activities, {
    fields: [activityRatings.activityId],
    references: [activities.id],
  }),
  coach: one(users, {
    fields: [activityRatings.coachUserId],
    references: [users.id],
  }),
}));

// Type exports
export type PracticeTemplate = typeof practiceTemplates.$inferSelect;
export type NewPracticeTemplate = typeof practiceTemplates.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type SessionPlan = typeof sessionPlans.$inferSelect;
export type NewSessionPlan = typeof sessionPlans.$inferInsert;
export type SessionActivityUsage = typeof sessionActivityUsage.$inferSelect;
export type NewSessionActivityUsage = typeof sessionActivityUsage.$inferInsert;
export type ActivityRating = typeof activityRatings.$inferSelect;
export type NewActivityRating = typeof activityRatings.$inferInsert;

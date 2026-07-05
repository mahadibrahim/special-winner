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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sports } from "./sports";
import { developmentStages, skills } from "./curriculum";
import { organizations } from "./organizations";

// Enums
export const triggerContextEnum = pgEnum("trigger_context", [
  "pre_practice",
  "during_practice",
  "post_practice",
  "pre_game",
  "during_game",
  "post_game",
  "assessment",
  "general",
]);

export const promptTypeEnum = pgEnum("prompt_type", [
  "question", // Questions to ask players (European coaching style)
  "reminder", // Reminders for the coach
  "tip", // Coaching tips
  "warning", // Things to watch out for
  "encouragement", // Positive reinforcement phrases
]);

export const promptFrequencyEnum = pgEnum("prompt_frequency", [
  "always", // Show every time
  "first_time", // Show only first time
  "weekly", // Show once per week
  "monthly", // Show once per month
  "random", // Randomly show
]);

export const coachResourceTypeEnum = pgEnum("coach_resource_type", [
  "video",
  "article",
  "diagram",
  "document",
  "external_link",
]);

// Coach Prompts (just-in-time coaching guidance)
//
// Natural-key choice for the idempotent curriculum loader (Task 1 of the
// curriculum-recovery plan): `title` is nullable here (many recovered prompts
// have no title), so it cannot anchor a upsert key. `content` is the one
// always-present, human-identifying text column (`.notNull()` above) — the
// loader upserts on it via `coach_prompts_content_uniq`. This assumes prompt
// content stays within Postgres's btree index entry size limit (~2.7KB);
// recovered prompts are short coaching lines/questions, well under that.
export const coachPrompts = pgTable(
  "coach_prompts",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }), // null = global prompt
  sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => developmentStages.id, { onDelete: "set null" }),
  skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
  triggerContext: triggerContextEnum("trigger_context").notNull(),
  promptType: promptTypeEnum("prompt_type").notNull(),
  content: text("content").notNull(),
  title: varchar("title", { length: 255 }),
  // Display configuration
  priority: integer("priority").default(0).notNull(), // Higher = more important
  frequency: promptFrequencyEnum("frequency").default("random").notNull(),
  // Conditions for showing (optional)
  conditions: jsonb("conditions").$type<{
    minCoachExperience?: number; // Don't show to experienced coaches
    maxCoachExperience?: number; // Only show to new coaches
    dayOfWeek?: number[]; // Which days to show
    weekOfSeason?: number[]; // Which weeks of season
  }>(),
  // European coaching style attributes
  isQuestionBased: boolean("is_question_based").default(false).notNull(),
  targetedBehavior: text("targeted_behavior"), // What behavior this prompt addresses
  tags: jsonb("tags").$type<string[]>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("coach_prompts_content_uniq").on(table.content)],
);

// Coach Resources (educational content for coaches)
export const coachResources = pgTable(
  "coach_resources",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }), // null = global resource
  sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => developmentStages.id, { onDelete: "set null" }),
  skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
  resourceType: coachResourceTypeEnum("resource_type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  url: text("url"), // URL for external resources
  content: text("content"), // Inline content for articles/diagrams
  thumbnailUrl: text("thumbnail_url"),
  durationMinutes: integer("duration_minutes"), // For videos
  // Categorization
  topic: varchar("topic", { length: 100 }), // 'technique', 'psychology', 'safety', etc.
  tags: jsonb("tags").$type<string[]>(),
  // Source attribution
  source: varchar("source", { length: 255 }),
  author: varchar("author", { length: 255 }),
  // Usage tracking
  viewCount: integer("view_count").default(0).notNull(),
  featured: boolean("featured").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("coach_resources_title_uniq").on(table.title)],
);

// Coach Prompt Dismissals (track which prompts coaches have seen/dismissed)
export const coachPromptDismissals = pgTable("coach_prompt_dismissals", {
  id: uuid("id").primaryKey().defaultRandom(),
  coachUserId: uuid("coach_user_id").notNull(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => coachPrompts.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
  dismissType: varchar("dismiss_type", { length: 50 }), // 'temporary', 'permanent', 'helpful'
});

// Coach Resource Views (track coach engagement with resources)
export const coachResourceViews = pgTable("coach_resource_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  coachUserId: uuid("coach_user_id").notNull(),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => coachResources.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"), // For videos, when they finished watching
  rating: integer("rating"), // 1-5 usefulness rating
  notes: text("notes"), // Coach's personal notes about this resource
});

// Coaching Principles (core principles by stage/sport)
export const coachingPrinciples = pgTable(
  "coaching_principles",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => developmentStages.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  principle: text("principle").notNull(),
  explanation: text("explanation"),
  doExamples: jsonb("do_examples").$type<string[]>(), // What TO DO
  dontExamples: jsonb("dont_examples").$type<string[]>(), // What NOT TO DO
  europeanInsight: text("european_insight"), // European best practice context
  source: varchar("source", { length: 255 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("coaching_principles_title_uniq").on(table.title)],
);

// Relations
export const coachPromptsRelations = relations(coachPrompts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [coachPrompts.organizationId],
    references: [organizations.id],
  }),
  sport: one(sports, {
    fields: [coachPrompts.sportId],
    references: [sports.id],
  }),
  stage: one(developmentStages, {
    fields: [coachPrompts.stageId],
    references: [developmentStages.id],
  }),
  skill: one(skills, {
    fields: [coachPrompts.skillId],
    references: [skills.id],
  }),
  dismissals: many(coachPromptDismissals),
}));

export const coachResourcesRelations = relations(coachResources, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [coachResources.organizationId],
    references: [organizations.id],
  }),
  sport: one(sports, {
    fields: [coachResources.sportId],
    references: [sports.id],
  }),
  stage: one(developmentStages, {
    fields: [coachResources.stageId],
    references: [developmentStages.id],
  }),
  skill: one(skills, {
    fields: [coachResources.skillId],
    references: [skills.id],
  }),
  views: many(coachResourceViews),
}));

export const coachPromptDismissalsRelations = relations(coachPromptDismissals, ({ one }) => ({
  prompt: one(coachPrompts, {
    fields: [coachPromptDismissals.promptId],
    references: [coachPrompts.id],
  }),
}));

export const coachResourceViewsRelations = relations(coachResourceViews, ({ one }) => ({
  resource: one(coachResources, {
    fields: [coachResourceViews.resourceId],
    references: [coachResources.id],
  }),
}));

export const coachingPrinciplesRelations = relations(coachingPrinciples, ({ one }) => ({
  sport: one(sports, {
    fields: [coachingPrinciples.sportId],
    references: [sports.id],
  }),
  stage: one(developmentStages, {
    fields: [coachingPrinciples.stageId],
    references: [developmentStages.id],
  }),
}));

// Type exports
export type CoachPrompt = typeof coachPrompts.$inferSelect;
export type NewCoachPrompt = typeof coachPrompts.$inferInsert;
export type CoachResource = typeof coachResources.$inferSelect;
export type NewCoachResource = typeof coachResources.$inferInsert;
export type CoachPromptDismissal = typeof coachPromptDismissals.$inferSelect;
export type NewCoachPromptDismissal = typeof coachPromptDismissals.$inferInsert;
export type CoachResourceView = typeof coachResourceViews.$inferSelect;
export type NewCoachResourceView = typeof coachResourceViews.$inferInsert;
export type CoachingPrinciple = typeof coachingPrinciples.$inferSelect;
export type NewCoachingPrinciple = typeof coachingPrinciples.$inferInsert;

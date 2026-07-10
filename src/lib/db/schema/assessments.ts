import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { familyMembers } from "./registrations";
import { seasons } from "./programs";
import { skills, skillDomains } from "./curriculum";
import { teams } from "./teams";

// Enums
export const observationContextEnum = pgEnum("observation_context", [
  "practice",
  "game",
  "test",
  "scrimmage",
  "training",
]);

export const trendDirectionEnum = pgEnum("trend_direction", [
  "improving",
  "stable",
  "declining",
  "new",
]);

export const assessmentLevelEnum = pgEnum("assessment_level", [
  "1", // Emerging/Beginning
  "2", // Developing
  "3", // Competent
  "4", // Proficient
  "5", // Advanced/Expert
]);

// Assessment Rubrics (detailed criteria for each skill level)
export const assessmentRubrics = pgTable("assessment_rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  level: integer("level").notNull(), // 1-5
  levelName: varchar("level_name", { length: 50 }).notNull(), // 'Emerging', 'Developing', etc.
  criteria: text("criteria").notNull(), // What this level looks like
  observableBehaviors: text("observable_behaviors").array(), // Specific things to watch for
  commonMistakes: text("common_mistakes").array(), // What to correct
  coachingTips: text("coaching_tips").array(), // How to help player improve
  exampleActivities: text("example_activities").array(), // Activities to develop this level
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Player Assessments (individual assessment records)
export const playerAssessments = pgTable("player_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyMemberId: uuid("family_member_id")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  coachUserId: uuid("coach_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  level: integer("level").notNull(), // 1-5 rating
  previousLevel: integer("previous_level"), // Previous assessment level for comparison
  observationContext: observationContextEnum("observation_context")
    .default("practice")
    .notNull(),
  notes: text("notes"), // Free-form coach notes
  strengths: text("strengths").array(), // Observed strengths
  areasForImprovement: text("areas_for_improvement").array(), // Areas to work on
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Assessment Snapshots (aggregated per season/domain for reporting)
export const assessmentSnapshots = pgTable(
  "assessment_snapshots",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  familyMemberId: uuid("family_member_id")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => skillDomains.id, { onDelete: "cascade" }),
  averageLevel: decimal("average_level", { precision: 3, scale: 2 }), // e.g., 3.5
  assessmentCount: integer("assessment_count").default(0).notNull(),
  skillsAssessed: integer("skills_assessed").default(0).notNull(),
  trend: trendDirectionEnum("trend").default("new").notNull(),
  previousAverageLevel: decimal("previous_average_level", { precision: 3, scale: 2 }),
  snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the snapshot upsert (Task 9): one row per
    // family member × season × domain.
    uniqueIndex("assessment_snapshots_member_season_domain_uniq").on(
      table.familyMemberId,
      table.seasonId,
      table.domainId,
    ),
  ],
);

// Player Skill Summary (current state per skill for quick lookups)
export const playerSkillSummary = pgTable(
  "player_skill_summary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    currentLevel: integer("current_level").notNull(), // Most recent assessment level
    highestLevel: integer("highest_level").notNull(), // Best level achieved
    assessmentCount: integer("assessment_count").default(1).notNull(),
    trend: trendDirectionEnum("trend").default("new").notNull(),
    firstAssessedAt: timestamp("first_assessed_at").notNull(),
    lastAssessedAt: timestamp("last_assessed_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the assessment-write upsert (D5): one summary row per
    // family member × skill. Migration 0075 dedupes pre-existing rows.
    uniqueIndex("player_skill_summary_member_skill_uniq").on(
      table.familyMemberId,
      table.skillId,
    ),
  ],
);

// Player Achievements (unlocked based on assessments)
export const playerAchievements = pgTable("player_achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyMemberId: uuid("family_member_id")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  achievementType: varchar("achievement_type", { length: 100 }).notNull(), // 'skill_mastery', 'domain_milestone', etc.
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  // What triggered this achievement
  triggerSkillId: uuid("trigger_skill_id").references(() => skills.id, { onDelete: "set null" }),
  triggerDomainId: uuid("trigger_domain_id").references(() => skillDomains.id, {
    onDelete: "set null",
  }),
  triggerLevel: integer("trigger_level"),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
  notifiedParent: timestamp("notified_parent"), // When parent was notified
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const assessmentRubricsRelations = relations(assessmentRubrics, ({ one }) => ({
  skill: one(skills, {
    fields: [assessmentRubrics.skillId],
    references: [skills.id],
  }),
}));

export const playerAssessmentsRelations = relations(playerAssessments, ({ one }) => ({
  familyMember: one(familyMembers, {
    fields: [playerAssessments.familyMemberId],
    references: [familyMembers.id],
  }),
  skill: one(skills, {
    fields: [playerAssessments.skillId],
    references: [skills.id],
  }),
  season: one(seasons, {
    fields: [playerAssessments.seasonId],
    references: [seasons.id],
  }),
  team: one(teams, {
    fields: [playerAssessments.teamId],
    references: [teams.id],
  }),
  coach: one(users, {
    fields: [playerAssessments.coachUserId],
    references: [users.id],
  }),
}));

export const assessmentSnapshotsRelations = relations(assessmentSnapshots, ({ one }) => ({
  familyMember: one(familyMembers, {
    fields: [assessmentSnapshots.familyMemberId],
    references: [familyMembers.id],
  }),
  season: one(seasons, {
    fields: [assessmentSnapshots.seasonId],
    references: [seasons.id],
  }),
  domain: one(skillDomains, {
    fields: [assessmentSnapshots.domainId],
    references: [skillDomains.id],
  }),
}));

export const playerSkillSummaryRelations = relations(playerSkillSummary, ({ one }) => ({
  familyMember: one(familyMembers, {
    fields: [playerSkillSummary.familyMemberId],
    references: [familyMembers.id],
  }),
  skill: one(skills, {
    fields: [playerSkillSummary.skillId],
    references: [skills.id],
  }),
}));

export const playerAchievementsRelations = relations(playerAchievements, ({ one }) => ({
  familyMember: one(familyMembers, {
    fields: [playerAchievements.familyMemberId],
    references: [familyMembers.id],
  }),
  triggerSkill: one(skills, {
    fields: [playerAchievements.triggerSkillId],
    references: [skills.id],
  }),
  triggerDomain: one(skillDomains, {
    fields: [playerAchievements.triggerDomainId],
    references: [skillDomains.id],
  }),
  season: one(seasons, {
    fields: [playerAchievements.seasonId],
    references: [seasons.id],
  }),
}));

// Type exports
export type AssessmentRubric = typeof assessmentRubrics.$inferSelect;
export type NewAssessmentRubric = typeof assessmentRubrics.$inferInsert;
export type PlayerAssessment = typeof playerAssessments.$inferSelect;
export type NewPlayerAssessment = typeof playerAssessments.$inferInsert;
export type AssessmentSnapshot = typeof assessmentSnapshots.$inferSelect;
export type NewAssessmentSnapshot = typeof assessmentSnapshots.$inferInsert;
export type PlayerSkillSummary = typeof playerSkillSummary.$inferSelect;
export type NewPlayerSkillSummary = typeof playerSkillSummary.$inferInsert;
export type PlayerAchievement = typeof playerAchievements.$inferSelect;
export type NewPlayerAchievement = typeof playerAchievements.$inferInsert;

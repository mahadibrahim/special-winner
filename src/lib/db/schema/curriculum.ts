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
  decimal,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sports } from "./sports";
import { organizations } from "./organizations";

// Enums
export const skillDomainNameEnum = pgEnum("skill_domain_name", [
  "technical",
  "tactical",
  "physical",
  "psychological",
]);

export const assessmentMethodEnum = pgEnum("assessment_method", [
  "observation",
  "test",
  "game",
  "self_report",
]);

// Development Stages (Discovery, Fundamentals, Skill Building, etc.)
export const developmentStages = pgTable("development_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(), // 'Discovery', 'Fundamentals', etc.
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  description: text("description"),
  philosophy: text("philosophy"), // The guiding philosophy for this stage
  practiceToGameRatio: varchar("practice_to_game_ratio", { length: 20 }), // '3:1', '2:1'
  maxHoursPerWeek: integer("max_hours_per_week"),
  keyPrinciples: jsonb("key_principles").$type<string[]>(), // Array of key principles
  coachRole: text("coach_role"), // Description of coach's role at this stage
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Skill Domains (Technical, Tactical, Physical, Psychological)
export const skillDomains = pgTable("skill_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: skillDomainNameEnum("name").notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }), // Hex color for UI
  icon: varchar("icon", { length: 50 }), // Icon name for UI
  assessmentFrequency: varchar("assessment_frequency", { length: 50 }), // 'weekly', 'monthly', 'per_season'
  weightInOverall: decimal("weight_in_overall", { precision: 3, scale: 2 }), // 0.25 for equal weighting
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Skills (master library of skills by sport and stage)
export const skills = pgTable(
  "skills",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }), // null = global skill
  sportId: uuid("sport_id")
    .notNull()
    .references(() => sports.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => skillDomains.id, { onDelete: "restrict" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => developmentStages.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  introductionAge: integer("introduction_age"), // Recommended age to introduce
  assessmentMethod: assessmentMethodEnum("assessment_method").default("observation").notNull(),
  // Progression level definitions (what each level 1-5 looks like)
  progressionLevels: jsonb("progression_levels").$type<{
    1: string;
    2: string;
    3: string;
    4: string;
    5: string;
  }>(),
  // Observable behaviors for each level
  observableBehaviors: jsonb("observable_behaviors").$type<string[]>(),
  // Common mistakes coaches should watch for
  commonMistakes: jsonb("common_mistakes").$type<string[]>(),
  // Coaching tips for teaching this skill
  coachingTips: jsonb("coaching_tips").$type<string[]>(),
  // Tags for filtering/searching
  tags: jsonb("tags").$type<string[]>(),
  // Comprehensive assessment guide (detailed rubrics, parent communication, etc.)
  comprehensiveGuide: jsonb("comprehensive_guide").$type<{
    // Assessment guidance per level
    levelDetails: {
      [level: number]: {
        name: string;
        description: string;
        observableBehaviors: string[];
        commonMistakes: string[];
        coachingTips: string[];
        assessmentActivities: string[];
      };
    };
    // Age-appropriate expectations (optional - not all skills have age-specific guidance)
    ageExpectations?: {
      ages6to8: { typicalLevel: string; notes: string };
      ages9to11: { typicalLevel: string; notes: string };
      ages12to14: { typicalLevel: string; notes: string };
    };
    // Red flags requiring additional support
    redFlags?: string[];
    // Parent communication
    parentExplanation?: string;
    homeActivities?: string[];
    // Assessment context
    bestAssessedIn?: string[];
    assessmentFrequency?: string;
    assessmentDuration?: string;
  }>(),
  // Is this a core/required skill for the stage?
  isCore: boolean("is_core").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the idempotent curriculum loader (Task 8): a skill is
    // identified by which sport it belongs to + its slug.
    uniqueIndex("skills_sport_slug_uniq").on(table.sportId, table.slug),
  ],
);

// Skill Progressions (prerequisite relationships between skills)
export const skillProgressions = pgTable("skill_progressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  prerequisiteSkillId: uuid("prerequisite_skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  requiredLevel: integer("required_level").default(3), // Level needed in prerequisite
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Skill Categories (for grouping skills within a domain)
export const skillCategories = pgTable("skill_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  sportId: uuid("sport_id")
    .notNull()
    .references(() => sports.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => skillDomains.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(), // 'Ball Control', 'Passing', 'Movement'
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Link skills to categories (many-to-many)
export const skillCategoryAssignments = pgTable("skill_category_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => skillCategories.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const developmentStagesRelations = relations(developmentStages, ({ many }) => ({
  skills: many(skills),
}));

export const skillDomainsRelations = relations(skillDomains, ({ many }) => ({
  skills: many(skills),
  categories: many(skillCategories),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [skills.organizationId],
    references: [organizations.id],
  }),
  sport: one(sports, {
    fields: [skills.sportId],
    references: [sports.id],
  }),
  domain: one(skillDomains, {
    fields: [skills.domainId],
    references: [skillDomains.id],
  }),
  stage: one(developmentStages, {
    fields: [skills.stageId],
    references: [developmentStages.id],
  }),
  progressionsFrom: many(skillProgressions, { relationName: "skillProgressions" }),
  prerequisites: many(skillProgressions, { relationName: "prerequisiteSkills" }),
  categoryAssignments: many(skillCategoryAssignments),
}));

export const skillProgressionsRelations = relations(skillProgressions, ({ one }) => ({
  skill: one(skills, {
    fields: [skillProgressions.skillId],
    references: [skills.id],
    relationName: "skillProgressions",
  }),
  prerequisite: one(skills, {
    fields: [skillProgressions.prerequisiteSkillId],
    references: [skills.id],
    relationName: "prerequisiteSkills",
  }),
}));

export const skillCategoriesRelations = relations(skillCategories, ({ one, many }) => ({
  sport: one(sports, {
    fields: [skillCategories.sportId],
    references: [sports.id],
  }),
  domain: one(skillDomains, {
    fields: [skillCategories.domainId],
    references: [skillDomains.id],
  }),
  skillAssignments: many(skillCategoryAssignments),
}));

export const skillCategoryAssignmentsRelations = relations(skillCategoryAssignments, ({ one }) => ({
  skill: one(skills, {
    fields: [skillCategoryAssignments.skillId],
    references: [skills.id],
  }),
  category: one(skillCategories, {
    fields: [skillCategoryAssignments.categoryId],
    references: [skillCategories.id],
  }),
}));

// Type exports
export type DevelopmentStage = typeof developmentStages.$inferSelect;
export type NewDevelopmentStage = typeof developmentStages.$inferInsert;
export type SkillDomain = typeof skillDomains.$inferSelect;
export type NewSkillDomain = typeof skillDomains.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillProgression = typeof skillProgressions.$inferSelect;
export type NewSkillProgression = typeof skillProgressions.$inferInsert;
export type SkillCategory = typeof skillCategories.$inferSelect;
export type NewSkillCategory = typeof skillCategories.$inferInsert;
export type SkillCategoryAssignment = typeof skillCategoryAssignments.$inferSelect;
export type NewSkillCategoryAssignment = typeof skillCategoryAssignments.$inferInsert;

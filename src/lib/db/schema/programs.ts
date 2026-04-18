import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  date,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "./organizations";
import { sports, ageGroups } from "./sports";

// Enums
export const programTypeEnum = pgEnum("program_type", [
  "league",
  "camp",
  "clinic",
  "tournament",
  "training",
]);

export const seasonStatusEnum = pgEnum("season_status", [
  "draft",
  "open",
  "closed",
  "active",
  "completed",
  "cancelled",
]);

// Programs table (recurring program types)
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  sportId: uuid("sport_id")
    .notNull()
    .references(() => sports.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  programType: programTypeEnum("program_type").default("league").notNull(),
  settings: jsonb("settings"),
  audienceType: varchar("audience_type", { length: 20 }).notNull().default("parents"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Seasons table (instances of programs)
export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  ageGroupId: uuid("age_group_id").references(() => ageGroups.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(), // 'Fall 2024', 'Summer Camp Week 1'
  slug: varchar("slug", { length: 100 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  registrationOpens: timestamp("registration_opens"),
  registrationCloses: timestamp("registration_closes"),
  earlyBirdDeadline: timestamp("early_bird_deadline"),
  maxParticipants: integer("max_participants"),
  minParticipants: integer("min_participants"),
  priceCents: integer("price_cents").notNull(),
  earlyBirdPriceCents: integer("early_bird_price_cents"),
  depositCents: integer("deposit_cents"),
  allowDeposit: boolean("allow_deposit").default(true),
  status: seasonStatusEnum("status").default("draft").notNull(),
  scheduleNotes: text("schedule_notes"), // 'Saturdays 9-10am'
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const programsRelations = relations(programs, ({ one, many }) => ({
  location: one(locations, {
    fields: [programs.locationId],
    references: [locations.id],
  }),
  sport: one(sports, {
    fields: [programs.sportId],
    references: [sports.id],
  }),
  seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({ one }) => ({
  program: one(programs, {
    fields: [seasons.programId],
    references: [programs.id],
  }),
  ageGroup: one(ageGroups, {
    fields: [seasons.ageGroupId],
    references: [ageGroups.id],
  }),
}));

// Type exports
export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;

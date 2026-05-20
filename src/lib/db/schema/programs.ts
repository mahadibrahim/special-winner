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
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { locations } from "./organizations";
import { sports, ageGroups } from "./sports";
import { venues } from "./teams";

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
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    // venueId is nullable — cross-org references are intentionally allowed
    // (e.g. Aspire Sports program at a SoccerOne facility). No same-org
    // constraint here; gating is enforced in the admin API layer.
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    programType: programTypeEnum("program_type").default("league").notNull(),
    settings: jsonb("settings"),
    audienceType: varchar("audience_type", { length: 20 }).notNull().default("parents"),
    active: boolean("active").default(true).notNull(),
    isTest: boolean("is_test").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("programs_location_idx").on(table.locationId),
    index("programs_sport_active_idx").on(table.sportId, table.active),
    // Program slugs are unique within a location (slugs route public URLs).
    uniqueIndex("programs_location_slug_uniq").on(table.locationId, table.slug),
  ],
);

// Seasons table (instances of programs)
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    ageGroupId: uuid("age_group_id").references(() => ageGroups.id, {
      onDelete: "set null",
    }),
    venueId: uuid("venue_id").references(() => venues.id, {
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
    // Individual / free-agent price (always present). For team-only
    // leagues this duplicates teamPriceCents and is hidden by the UI.
    priceCents: integer("price_cents").notNull(),
    // Team registration price. NULL when team signup is not offered.
    teamPriceCents: integer("team_price_cents"),
    // Which signup paths the season accepts: any combination of
    // ['individual', 'team']. Drives card display + which CTAs show.
    // Default '{individual}' covers the youth catalog; adult leagues are
    // populated via the data backfill in migration 0022.
    signupModes: varchar("signup_modes", { length: 20 })
      .array()
      .default(sql`ARRAY['individual']::varchar[]`)
      .notNull(),
    // Legacy: 'per_individual' | 'per_team'. Now derivable from
    // signupModes; kept for one release for backwards compat. Will be
    // dropped once all callsites read signupModes instead.
    pricingMode: varchar("pricing_mode", { length: 20 })
      .default("per_individual")
      .notNull(),
    earlyBirdPriceCents: integer("early_bird_price_cents"),
    depositCents: integer("deposit_cents"),
    allowDeposit: boolean("allow_deposit").default(true),
    status: seasonStatusEnum("status").default("draft").notNull(),
    scheduleNotes: text("schedule_notes"), // 'Saturdays 9-10am'
    settings: jsonb("settings"),
    isTest: boolean("is_test").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("seasons_program_idx").on(table.programId),
    index("seasons_status_registration_opens_idx").on(
      table.status,
      table.registrationOpens,
    ),
    // Season slugs are unique within a program.
    uniqueIndex("seasons_program_slug_uniq").on(table.programId, table.slug),
  ],
);

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
  venue: one(venues, {
    fields: [programs.venueId],
    references: [venues.id],
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
  venue: one(venues, {
    fields: [seasons.venueId],
    references: [venues.id],
  }),
}));

// Type exports
export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;

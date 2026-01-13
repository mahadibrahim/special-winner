import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { seasons } from "./programs";
import { locations } from "./organizations";
import { registrations, familyMembers } from "./registrations";

// Enums
export const rosterStatusEnum = pgEnum("roster_status", [
  "active",
  "inactive",
  "injured",
]);

export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "in_progress",
  "completed",
  "postponed",
  "cancelled",
]);

export const noteCategoryEnum = pgEnum("note_category", [
  "progress",
  "achievement",
  "focus",
  "encouragement",
  "general",
]);

// Venues/Facilities
export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  fieldCount: integer("field_count").default(1),
  indoor: boolean("indoor").default(false),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teams
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }),
  logoUrl: text("logo_url"),
  coachUserId: uuid("coach_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  assistantCoachUserId: uuid("assistant_coach_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  maxRosterSize: integer("max_roster_size"),
  division: varchar("division", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Roster entries (players on teams)
export const rosters = pgTable("rosters", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "cascade" }),
  jerseyNumber: varchar("jersey_number", { length: 10 }),
  position: varchar("position", { length: 50 }),
  status: rosterStatusEnum("status").default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Games/Matches
export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  homeTeamId: uuid("home_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  awayTeamId: uuid("away_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
  fieldNumber: varchar("field_number", { length: 20 }),
  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes"),
  status: gameStatusEnum("status").default("scheduled").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Standings (calculated/cached)
export const standings = pgTable("standings", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  division: varchar("division", { length: 50 }),
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  ties: integer("ties").default(0).notNull(),
  pointsFor: integer("points_for").default(0).notNull(),
  pointsAgainst: integer("points_against").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Coach Notes (feedback about players)
export const coachNotes = pgTable("coach_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyMemberId: uuid("family_member_id")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  coachUserId: uuid("coach_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  category: noteCategoryEnum("category").default("general").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  visibleToParent: boolean("visible_to_parent").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const venuesRelations = relations(venues, ({ one, many }) => ({
  location: one(locations, {
    fields: [venues.locationId],
    references: [locations.id],
  }),
  games: many(games),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  season: one(seasons, {
    fields: [teams.seasonId],
    references: [seasons.id],
  }),
  coach: one(users, {
    fields: [teams.coachUserId],
    references: [users.id],
  }),
  assistantCoach: one(users, {
    fields: [teams.assistantCoachUserId],
    references: [users.id],
  }),
  rosters: many(rosters),
  homeGames: many(games, { relationName: "homeTeam" }),
  awayGames: many(games, { relationName: "awayTeam" }),
  standings: many(standings),
}));

export const rostersRelations = relations(rosters, ({ one }) => ({
  team: one(teams, {
    fields: [rosters.teamId],
    references: [teams.id],
  }),
  registration: one(registrations, {
    fields: [rosters.registrationId],
    references: [registrations.id],
  }),
}));

export const gamesRelations = relations(games, ({ one }) => ({
  season: one(seasons, {
    fields: [games.seasonId],
    references: [seasons.id],
  }),
  homeTeam: one(teams, {
    fields: [games.homeTeamId],
    references: [teams.id],
    relationName: "homeTeam",
  }),
  awayTeam: one(teams, {
    fields: [games.awayTeamId],
    references: [teams.id],
    relationName: "awayTeam",
  }),
  venue: one(venues, {
    fields: [games.venueId],
    references: [venues.id],
  }),
}));

export const standingsRelations = relations(standings, ({ one }) => ({
  season: one(seasons, {
    fields: [standings.seasonId],
    references: [seasons.id],
  }),
  team: one(teams, {
    fields: [standings.teamId],
    references: [teams.id],
  }),
}));

export const coachNotesRelations = relations(coachNotes, ({ one }) => ({
  familyMember: one(familyMembers, {
    fields: [coachNotes.familyMemberId],
    references: [familyMembers.id],
  }),
  team: one(teams, {
    fields: [coachNotes.teamId],
    references: [teams.id],
  }),
  coach: one(users, {
    fields: [coachNotes.coachUserId],
    references: [users.id],
  }),
}));

// Type exports
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Roster = typeof rosters.$inferSelect;
export type NewRoster = typeof rosters.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Standing = typeof standings.$inferSelect;
export type NewStanding = typeof standings.$inferInsert;
export type CoachNote = typeof coachNotes.$inferSelect;
export type NewCoachNote = typeof coachNotes.$inferInsert;

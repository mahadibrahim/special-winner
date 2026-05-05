import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { seasons } from "./programs";
import { users } from "./users";
import { registrations } from "./registrations";

/**
 * Team-level registration grouping. One row per captain-led team for a
 * specific season. The captain creates the team (this row) and shares the
 * inviteToken with prospective teammates, who then complete the existing
 * per-player registration flow.
 *
 * v1 scope: per-player payments are still individual through the existing
 * registration wizard — there is no auto-charge or payment splitting.
 * The TeamPayer-style game-day auto-charge requires a scheduled-job system
 * worth its own design pass.
 */
export const teamRegistrations = pgTable("team_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  captainUserId: uuid("captain_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  captainEmail: varchar("captain_email", { length: 320 }).notNull(),
  captainName: varchar("captain_name", { length: 200 }).notNull(),

  teamName: varchar("team_name", { length: 200 }).notNull(),
  inviteToken: varchar("invite_token", { length: 64 }).notNull().unique(),
  notes: text("notes"),

  status: varchar("status", { length: 30 }).default("forming").notNull(),
  // 'forming' | 'roster_complete' | 'cancelled'

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Membership lookup: registrations that belong to a team.
 * Populated post-registration when the joining flow carries a team token.
 */
export const teamRegistrationMembers = pgTable("team_registration_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamRegistrationId: uuid("team_registration_id")
    .notNull()
    .references(() => teamRegistrations.id, { onDelete: "cascade" }),
  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default("member").notNull(),
  // 'captain' | 'member'
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type TeamRegistration = typeof teamRegistrations.$inferSelect;
export type NewTeamRegistration = typeof teamRegistrations.$inferInsert;
export type TeamRegistrationMember = typeof teamRegistrationMembers.$inferSelect;
export type NewTeamRegistrationMember = typeof teamRegistrationMembers.$inferInsert;

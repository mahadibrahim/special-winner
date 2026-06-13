import { pgTable, uuid, text, varchar, integer, numeric, boolean, date, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, locations } from "./organizations";
import { users } from "./users";

export const dropDivisionEnum = pgEnum("drop_division", ["mens", "womens"]);
export const dropSeasonStatusEnum = pgEnum("drop_season_status", ["draft", "open", "active", "completed", "cancelled"]);
export const dropPlayerStatusEnum = pgEnum("drop_player_status", ["registered", "active", "graduated", "cancelled"]);

export const dropSeasons = pgTable("drop_seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  division: dropDivisionEnum("division").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  sessionDay: integer("session_day"),
  maxPlayers: integer("max_players"),
  status: dropSeasonStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("drop_seasons_org_idx").on(t.organizationId),
  uniqueIndex("drop_seasons_org_slug_uniq").on(t.organizationId, t.slug),
]);

export const dropPlayers = pgTable("drop_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  dropSeasonId: uuid("drop_season_id").notNull().references(() => dropSeasons.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  division: dropDivisionEnum("division").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  dob: date("dob"),
  heightCm: integer("height_cm").notNull(),
  seasonStartWeightG: integer("season_start_weight_g").notNull(),
  currentWeightG: integer("current_weight_g").notNull(),
  bmi: numeric("bmi", { precision: 4, scale: 1 }).notNull(),
  maintenanceStatus: boolean("maintenance_status").default(false).notNull(),
  consentAt: timestamp("consent_at").notNull(),
  status: dropPlayerStatusEnum("status").default("registered").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("drop_players_season_idx").on(t.dropSeasonId),
  uniqueIndex("drop_players_season_email_uniq").on(t.dropSeasonId, sql`lower(${t.email})`),
]);

export type DropSeason = typeof dropSeasons.$inferSelect;
export type NewDropSeason = typeof dropSeasons.$inferInsert;
export type DropPlayer = typeof dropPlayers.$inferSelect;
export type NewDropPlayer = typeof dropPlayers.$inferInsert;

export const dropSubscriptionStatusEnum = pgEnum("drop_subscription_status", ["incomplete", "active", "past_due", "paused", "cancelled"]);

export const dropSubscriptions = pgTable("drop_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dropPlayerId: uuid("drop_player_id").notNull().references(() => dropPlayers.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: dropSubscriptionStatusEnum("status").default("incomplete").notNull(),
  registrationFeePaid: boolean("registration_fee_paid").default(false).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Unique: one subscription row per drop player (a player registers for one
  // drop season). Required for the webhook's ON CONFLICT (drop_player_id) upsert.
  uniqueIndex("drop_subscriptions_player_uniq").on(t.dropPlayerId),
  uniqueIndex("drop_subscriptions_stripe_sub_uniq").on(t.stripeSubscriptionId),
]);

export type DropSubscription = typeof dropSubscriptions.$inferSelect;
export type NewDropSubscription = typeof dropSubscriptions.$inferInsert;

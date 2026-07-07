import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues, games } from "./teams";
import { users } from "./users";

/**
 * In-app time tracking + geolocation (product-backlog build #5). Coaches and
 * venue managers are clocked hourly (no gameId); referees clock per-match
 * (gameId required). Browser Geolocation is captured at the clock-in/out tap
 * and compared against the venue's coordinates via a pure haversine distance
 * check — the result is always a *flag*, never a block (see
 * docs/superpowers/plans/2026-07-07-time-tracking.md, owner decision #2).
 */
export const laborRoleEnum = pgEnum("labor_role", [
  "coach",
  "venue_manager",
  "referee",
]);

export const laborFlagReasonEnum = pgEnum("labor_flag_reason", [
  "missing_location",
  "out_of_range",
]);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    role: laborRoleEnum("role").notNull(),
    // Set only for referee entries (per-match shifts). Null for hourly
    // coach/venue_manager shifts. Enforced by the check constraint below.
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    clockInLat: decimal("clock_in_lat", { precision: 10, scale: 6 }),
    clockInLng: decimal("clock_in_lng", { precision: 10, scale: 6 }),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    clockOutLat: decimal("clock_out_lat", { precision: 10, scale: 6 }),
    clockOutLng: decimal("clock_out_lng", { precision: 10, scale: 6 }),
    // Distance (meters) between clock-in coordinates and the venue's
    // coordinates, rounded. Null when the venue has no coordinates or the
    // client didn't supply a location (missing_location flag path).
    clockInDistanceM: integer("clock_in_distance_m"),
    flaggedOutOfRange: boolean("flagged_out_of_range").notNull().default(false),
    flagReason: laborFlagReasonEnum("flag_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("time_entries_org_idx").on(table.organizationId),
    index("time_entries_user_idx").on(table.userId),
    index("time_entries_venue_idx").on(table.venueId),
    index("time_entries_game_idx").on(table.gameId),
    // One open (not-yet-clocked-out) hourly shift per user at a time.
    // Referee per-match entries (gameId set) are excluded — a referee can
    // have an open shift on one match while starting another.
    uniqueIndex("time_entries_one_open_shift_per_user")
      .on(table.userId)
      .where(sql`${table.clockOutAt} IS NULL AND ${table.gameId} IS NULL`),
    // One time entry per (game, user) — a referee can't double clock-in to
    // the same match.
    uniqueIndex("time_entries_one_per_game_user")
      .on(table.gameId, table.userId)
      .where(sql`${table.gameId} IS NOT NULL`),
    check(
      "time_entries_clock_out_after_in",
      sql`${table.clockOutAt} IS NULL OR ${table.clockOutAt} > ${table.clockInAt}`,
    ),
    // referee role <=> gameId set (biconditional).
    check(
      "time_entries_referee_iff_game_id",
      sql`(${table.role} = 'referee' AND ${table.gameId} IS NOT NULL) OR (${table.role} <> 'referee' AND ${table.gameId} IS NULL)`,
    ),
  ],
);

// One-time in-app acknowledgement of the location-tracking notice (owner
// decision #1 — no e-signature, just a versioned acknowledgement). Unique
// per (user, org) so re-acknowledging the same version is idempotent at the
// application layer; a new noticeVersion is a fresh row.
export const staffLocationConsents = pgTable(
  "staff_location_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    noticeVersion: varchar("notice_version", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_location_consents_user_org_uniq").on(
      table.userId,
      table.organizationId,
    ),
    index("staff_location_consents_org_idx").on(table.organizationId),
  ],
);

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  organization: one(organizations, {
    fields: [timeEntries.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  venue: one(venues, {
    fields: [timeEntries.venueId],
    references: [venues.id],
  }),
  game: one(games, {
    fields: [timeEntries.gameId],
    references: [games.id],
  }),
}));

export const staffLocationConsentsRelations = relations(
  staffLocationConsents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [staffLocationConsents.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [staffLocationConsents.userId],
      references: [users.id],
    }),
  }),
);

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type StaffLocationConsent = typeof staffLocationConsents.$inferSelect;
export type NewStaffLocationConsent = typeof staffLocationConsents.$inferInsert;
export type LaborRole = (typeof laborRoleEnum.enumValues)[number];
export type LaborFlagReason = (typeof laborFlagReasonEnum.enumValues)[number];

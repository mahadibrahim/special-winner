import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { seasons } from "./programs";
import { locations } from "./organizations";
import { registrations, familyMembers } from "./registrations";
import { sessionPlans } from "./practice-planning";

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

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "practice",
  "game",
  "other",
]);

// Venues/Facilities
export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Human-friendly kiosk URL segment, e.g. `/kiosk/downtown`. Globally
    // unique (the kiosk route is not org-scoped — it resolves the org from
    // the venue). Null until a manager sets one; the venue UUID still works
    // as the kiosk slug either way.
    slug: varchar("slug", { length: 64 }),
    address: text("address"),
    fieldCount: integer("field_count").default(1),
    indoor: boolean("indoor").default(false),
    owned: boolean("owned").notNull().default(false),
    concessions: boolean("concessions").notNull().default(false),
    parkingManaged: boolean("parking_managed").notNull().default(false),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    // Stripe Connect destination charge support for partner-owned venues
    // (e.g. drop-in soccer at indoor partner facilities). When set, drop-in
    // bookings split payment to the partner's Connect account using
    // application_fee_pct as the platform's cut.
    partnerStripeAccountId: text("partner_stripe_account_id"),
    partnerApplicationFeePct: integer("partner_application_fee_pct"),
    // Field rental config. rentalEnabled gates the feature per venue;
    // rentalHourlyRateCents overrides the org rate-card default when set;
    // open/close minutes bound the rentable window (minutes from midnight,
    // org timezone). Null open/close means no time-of-day restriction.
    rentalEnabled: boolean("rental_enabled").notNull().default(false),
    rentalHourlyRateCents: integer("rental_hourly_rate_cents"),
    rentalOpenMinute: integer("rental_open_minute"),
    rentalCloseMinute: integer("rental_close_minute"),
    // Geofence anchor for in-app time tracking (product-backlog build #5).
    // Null coordinates mean the venue has no geofence configured — the
    // geofence helper treats that as "never flag" rather than failing.
    // radiusM overrides the DEFAULT_GEOFENCE_RADIUS_M (150m) constant when
    // set; null falls back to the constant.
    latitude: decimal("latitude", { precision: 10, scale: 6 }),
    longitude: decimal("longitude", { precision: 10, scale: 6 }),
    radiusM: integer("radius_m"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("venues_location_idx").on(table.locationId),
    uniqueIndex("venues_slug_unique").on(table.slug),
  ],
);

// Teams
export const teams = pgTable(
  "teams",
  {
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
  },
  (table) => [
    index("teams_season_idx").on(table.seasonId),
    index("teams_coach_user_idx").on(table.coachUserId),
  ],
);

// Roster entries (players on teams)
export const rosters = pgTable(
  "rosters",
  {
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
  },
  (table) => [
    index("rosters_team_idx").on(table.teamId),
    index("rosters_registration_idx").on(table.registrationId),
    // A registration can only appear once on a given team's roster.
    uniqueIndex("rosters_team_registration_uniq").on(
      table.teamId,
      table.registrationId,
    ),
  ],
);

// Games/Matches
export const games = pgTable(
  "games",
  {
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
    refereeNotes: text("referee_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("games_season_idx").on(table.seasonId),
    index("games_home_team_idx").on(table.homeTeamId),
    index("games_away_team_idx").on(table.awayTeamId),
    index("games_scheduled_at_idx").on(table.scheduledAt),
    // A team cannot play itself. NULL team ids (TBD fixtures) pass the
    // check — `null <> null` is NULL, and CHECK only rejects on FALSE.
    check("games_distinct_teams", sql`${table.homeTeamId} <> ${table.awayTeamId}`),
    // Scores are non-negative when present; NULL (unplayed) is allowed.
    check(
      "games_non_negative_scores",
      sql`(${table.homeScore} IS NULL OR ${table.homeScore} >= 0) AND (${table.awayScore} IS NULL OR ${table.awayScore} >= 0)`,
    ),
  ],
);

// Game officials — referee/AR assignments per game. Fee + paymentStatus
// track what each official is owed for the assignment; payouts are
// manual (Stripe dashboard transfers) for v1, so paymentStatus is a
// bookkeeping flag, not a payment-system pointer.
export const officialPaymentStatusEnum = pgEnum("official_payment_status", [
  "unpaid",
  "paid",
]);

export const gameOfficials = pgTable(
  "game_officials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Free-text-ish slot label; "referee" for the single-ref MVP, room
    // for "ar1"/"ar2"/"fourth" later without a schema change.
    position: varchar("position", { length: 50 }).default("referee").notNull(),
    feeCents: integer("fee_cents").default(0).notNull(),
    paymentStatus: officialPaymentStatusEnum("payment_status")
      .default("unpaid")
      .notNull(),
    // Escalating close-out SMS reminder stage: 0 = none sent, 1 = T+2h
    // reminder sent, 2 = morning reminder sent (then we stop texting and
    // let the admin dialog flag it). See referee-closeout-reminders cron.
    closeoutRemindersSent: integer("closeout_reminders_sent").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One assignment per (game, official) — re-assigning updates the row.
    uniqueIndex("game_officials_game_user_uniq").on(table.gameId, table.userId),
    index("game_officials_game_idx").on(table.gameId),
    index("game_officials_user_idx").on(table.userId),
    check("game_officials_non_negative_fee", sql`${table.feeCents} >= 0`),
  ],
);

export const gameIncidentTypeEnum = pgEnum("game_incident_type", [
  "yellow_card",
  "red_card",
  "injury",
  "other",
  // Added for the ejection/suspension tracker (product backlog build #4).
  // A distinct enum value, not an is_ejection boolean — a coach ejection
  // isn't a red card. Created only via the additive
  // POST /api/referee/matches/[gameId]/ejections endpoint, never the
  // delete-all-reinsert /report bulk array (see report.ts).
  "ejection",
]);
export const gameSideEnum = pgEnum("game_side", ["home", "away"]);

// Structured incidents logged by the assigned referee when reporting a match.
export const gameIncidents = pgTable(
  "game_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: gameIncidentTypeEnum("type").notNull(),
    side: gameSideEnum("side").notNull(),
    player: varchar("player", { length: 120 }),
    minute: integer("minute"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("game_incidents_game_idx").on(t.gameId)],
);

// Standings (calculated/cached)
export const standings = pgTable(
  "standings",
  {
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
  },
  (table) => [
    // One standings row per (season, team) — the table is a cache.
    uniqueIndex("standings_season_team_uniq").on(table.seasonId, table.teamId),
  ],
);

// Coach Notes (feedback about players)
export const coachNotes = pgTable(
  "coach_notes",
  {
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
    sessionPlanId: uuid("session_plan_id").references(() => sessionPlans.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("coach_notes_family_member_team_idx").on(
      table.familyMemberId,
      table.teamId,
    ),
    index("coach_notes_session_plan_idx").on(table.sessionPlanId),
  ],
);

// Attendance tracking
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rosters.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    // Coach session lifecycle: precise lineage from a field-mode check-off
    // to its practice session. Null on rows from the standalone tracker.
    sessionPlanId: uuid("session_plan_id").references(() => sessionPlans.id, {
      onDelete: "set null",
    }),
    eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
    eventType: eventTypeEnum("event_type").default("practice").notNull(),
    status: attendanceStatusEnum("status").default("present").notNull(),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("attendance_team_event_date_idx").on(
      table.teamId,
      table.eventDate,
    ),
    index("attendance_roster_idx").on(table.rosterId),
    // Race-safety for the session-lifecycle flush endpoint: concurrent
    // flushes of the same envelope must not double-insert an attendance
    // row for the same (roster, session). Partial — scoped to
    // session_plan_id IS NOT NULL so standalone-tracker rows (null
    // sessionPlanId) may still legitimately repeat per roster.
    uniqueIndex("attendance_roster_session_uniq")
      .on(table.rosterId, table.sessionPlanId)
      .where(sql`session_plan_id IS NOT NULL`),
  ],
);

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

export const attendanceRelations = relations(attendance, ({ one }) => ({
  team: one(teams, {
    fields: [attendance.teamId],
    references: [teams.id],
  }),
  roster: one(rosters, {
    fields: [attendance.rosterId],
    references: [rosters.id],
  }),
  game: one(games, {
    fields: [attendance.gameId],
    references: [games.id],
  }),
  recordedBy: one(users, {
    fields: [attendance.recordedByUserId],
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
export type GameOfficial = typeof gameOfficials.$inferSelect;
export type NewGameOfficial = typeof gameOfficials.$inferInsert;
export type Standing = typeof standings.$inferSelect;
export type NewStanding = typeof standings.$inferInsert;
export type CoachNote = typeof coachNotes.$inferSelect;
export type NewCoachNote = typeof coachNotes.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;

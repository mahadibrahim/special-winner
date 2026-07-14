import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";
import { jobApplications } from "./job-applications";
import { dropInSessions } from "./drop-in";

/**
 * Pickup hosts — GoodRec-style community volunteers. A host_profiles row is
 * the source of truth for "this user may host pickup games in this org";
 * the session link is drop_in_sessions.host_user_id. Hosts are unpaid and
 * play free in games they host (a $0 `host_comp` booking).
 * See docs/superpowers/specs/2026-07-13-pickup-hosts-design.md.
 */

export const hostProfileStatusEnum = pgEnum("host_profile_status", [
  "active",
  "paused",
  "revoked",
]);

export const hostProfiles = pgTable(
  "host_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: hostProfileStatusEnum("status").notNull().default("active"),
    preferredVenueId: uuid("preferred_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    bio: text("bio"),
    // R2 object key, not a URL (signed URLs expire) — same convention as
    // job_applications.resume_key.
    photoKey: text("photo_key"),
    applicationId: uuid("application_id").references(() => jobApplications.id, {
      onDelete: "set null",
    }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("host_profiles_user_org_unique").on(table.userId, table.organizationId),
    index("host_profiles_org_status_idx").on(table.organizationId, table.status),
  ],
);

/**
 * "Text me when games need players" subscriptions. venueId/sport NULL =
 * all locations / all sports. Uniqueness is enforced at the API layer
 * (lookup-then-insert) rather than a partial NULLS NOT DISTINCT index;
 * the fill-alert dispatcher additionally dedupes per user per session.
 */
export const pickupAlertSubscriptions = pgTable(
  "pickup_alert_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    // Matches drop_in_sessions.sport_or_class_label (no sport FK exists).
    sport: varchar("sport", { length: 100 }),
    active: boolean("active").notNull().default(true),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pickup_alert_subs_user_idx").on(table.userId, table.organizationId),
    index("pickup_alert_subs_org_active_idx").on(table.organizationId, table.active),
  ],
);

/**
 * One row per fill-alert SMS actually dispatched. Backs the per-user daily
 * cap (max 2/day) and post-hoc attribution.
 */
export const pickupAlertSends = pgTable(
  "pickup_alert_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pickup_alert_sends_user_sent_idx").on(table.userId, table.sentAt),
    index("pickup_alert_sends_session_idx").on(table.sessionId),
  ],
);

/**
 * Host wrap-up report — one per session. No-show marking is NOT here (it
 * reuses drop_in_bookings.status = 'no_show').
 */
export const hostGameReports = pgTable(
  "host_game_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    hostProfileId: uuid("host_profile_id")
      .notNull()
      .references(() => hostProfiles.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    incidentFlagged: boolean("incident_flagged").notNull().default(false),
    incidentDetails: text("incident_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("host_game_reports_session_unique").on(table.sessionId)],
);

export type HostProfile = typeof hostProfiles.$inferSelect;
export type NewHostProfile = typeof hostProfiles.$inferInsert;
export type PickupAlertSubscription = typeof pickupAlertSubscriptions.$inferSelect;
export type NewPickupAlertSubscription = typeof pickupAlertSubscriptions.$inferInsert;
export type HostGameReport = typeof hostGameReports.$inferSelect;

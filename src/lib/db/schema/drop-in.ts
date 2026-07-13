import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";
import { mediaAssets } from "./media";
import { venueResources } from "./scheduling";

// === enums ===

export const dropInSessionKindEnum = pgEnum("drop_in_session_kind", ["pickup", "class"]);
export const dropInSkillLevelEnum = pgEnum("drop_in_skill_level", [
  "recreational",
  "intermediate",
  "advanced",
  "all_levels",
]);
export const dropInAudienceEnum = pgEnum("drop_in_audience", ["adults", "youth", "all_ages"]);
export const dropInSessionStatusEnum = pgEnum("drop_in_session_status", [
  "scheduled",
  "cancelled",
  "completed",
]);
export const dropInBookingStatusEnum = pgEnum("drop_in_booking_status", [
  "confirmed",
  "waitlisted",
  "pending_claim",
  "pending_payment",
  "cancelled",
  "no_show",
]);
export const dropInBookingSourceEnum = pgEnum("drop_in_booking_source", [
  "online_booking",
  "walk_up",
]);
export const dropInPaymentMethodEnum = pgEnum("drop_in_payment_method", [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
]);
export const dropInCancellationReasonEnum = pgEnum("drop_in_cancellation_reason", [
  "user_request",
  "no_show",
  "admin_override",
  "session_cancelled",
  "expired_promotion",
  "expired_payment_hold",
]);
export const skillLevelEnum = pgEnum("skill_level", [
  "recreational",
  "intermediate",
  "advanced",
]);
export const skillLevelSourceEnum = pgEnum("skill_level_source", [
  "self_reported",
  "admin_assigned",
]);

// === tables ===

export const dropInSessions = pgTable(
  "drop_in_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    // Which field the session occupies — feeds the field-time ledger
    // (resource_blocks). Required for NEW sessions at the API layer;
    // nullable in the DB for pre-ledger rows (backfilled to the venue's
    // Field 1 by migration; founder corrects per session in the admin).
    bookableResourceId: uuid("bookable_resource_id").references(
      () => venueResources.id,
      { onDelete: "set null" },
    ),
    kind: dropInSessionKindEnum("kind").notNull(),
    sportOrClassLabel: text("sport_or_class_label").notNull(),
    formatLabel: text("format_label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    capacityMale: integer("capacity_male"),
    capacityFemale: integer("capacity_female"),
    skillLevel: dropInSkillLevelEnum("skill_level").notNull().default("all_levels"),
    audience: dropInAudienceEnum("audience").notNull().default("adults"),
    membersOnly: boolean("members_only").notNull().default(false),
    sessionRateCents: integer("session_rate_cents"),
    memberRateCents: integer("member_rate_cents"),
    walkUpRateCents: integer("walk_up_rate_cents"),
    teamCount: integer("team_count").notNull().default(0),
    teamColors: text("team_colors")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: dropInSessionStatusEnum("status").notNull().default("scheduled"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("drop_in_sessions_org_starts_at_idx").on(table.organizationId, table.startsAt),
    index("drop_in_sessions_venue_starts_at_idx").on(table.venueId, table.startsAt),
    index("drop_in_sessions_status_idx").on(table.status),
  ],
);

export const dropInBookings = pgTable(
  "drop_in_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: dropInBookingStatusEnum("status").notNull(),
    source: dropInBookingSourceEnum("source").notNull(),
    paymentMethod: dropInPaymentMethodEnum("payment_method").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    // Soft reference — no FK; the memberships table does not exist yet.
    membershipId: uuid("membership_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    promotionExpiresAt: timestamp("promotion_expires_at", { withTimezone: true }),
    promotionToken: text("promotion_token"),
    teamAssignment: text("team_assignment"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: dropInCancellationReasonEnum("cancellation_reason"),
    // Stamped when the single pre-expiry payment reminder is sent for a
    // pending_payment hold. NULL means not yet reminded (or not applicable).
    // Stamp-then-send so a crashed send can't double-fire.
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    // Front-of-line ordering for promoteNextWaitlister: default 0 for a
    // normal waitlist join; the paid-checkout overflow path (a customer who
    // paid, got squeezed out by a same-instant confirm on the last spot, and
    // was auto-refunded) stamps 100 so they queue-jump everyone who joined
    // the waitlist voluntarily. promoteNextWaitlister orders by this column
    // DESC, then createdAt ASC, so ties within a priority tier stay FIFO.
    waitlistPriority: integer("waitlist_priority").notNull().default(0),
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    waiverSignedAt: timestamp("waiver_signed_at", { withTimezone: true }),
    waiverSignedBy: text("waiver_signed_by"),
    // Storefront brand the booking was made through. Default covers
    // pre-cutover rows and at-facility walk-ups (no host signal).
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // _v2: predicate extended to include 'pending_payment' (walk-in remote
    // payment hold) — see migration 0086, which drops the original
    // drop_in_bookings_one_active_per_user_session and creates this one.
    // The _v2 RENAME is load-bearing, not cosmetic: db-migrate-bootstrap.ts
    // verifies index migrations by NAME only, so a same-name drop+recreate
    // would be marked already-applied on any populated DB (staging/prod)
    // and silently skipped — the predicate would never actually widen
    // there. (Durable fix — bootstrap comparing indexdef, not name — is a
    // follow-up.) This is also the first migration in the repo to USE an
    // enum value ('pending_payment', added by 0084) in a later file; safe
    // now because scripts/db-migrate.ts applies each migration file in its
    // own transaction (0084's ADD VALUE is committed long before 0086
    // opens its transaction). Previously banned — see
    // .superpowers/sdd/payment-task-1-report.md.
    uniqueIndex("drop_in_bookings_one_active_per_user_session_v2")
      .on(table.sessionId, table.userId)
      .where(sql`status IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`),
    index("drop_in_bookings_session_status_idx").on(table.sessionId, table.status),
    index("drop_in_bookings_user_status_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("drop_in_bookings_promotion_expiry_idx")
      .on(table.promotionExpiresAt)
      .where(sql`status = 'pending_claim'`),
  ],
);

export const dropInRateCard = pgTable("drop_in_rate_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  defaultSessionRateCents: integer("default_session_rate_cents").notNull().default(1500),
  defaultMemberRateCents: integer("default_member_rate_cents").notNull().default(1200),
  defaultWalkUpRateCents: integer("default_walk_up_rate_cents").notNull().default(1700),
  cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
  promotionWindowMinutes: integer("promotion_window_minutes").notNull().default(30),
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique(),
    displayName: text("display_name").notNull(),
    logoMediaId: uuid("logo_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    heroCopy: jsonb("hero_copy"),
    colorTokens: jsonb("color_tokens"),
    footerCopy: text("footer_copy"),
    featuredVenueIds: uuid("featured_venue_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brand_profiles_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const userSkillLevels = pgTable(
  "user_skill_levels",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sport: text("sport").notNull(),
    level: skillLevelEnum("level").notNull(),
    source: skillLevelSourceEnum("source").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
    setByUserId: uuid("set_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sport] })],
);

// Type exports
export type DropInSession = typeof dropInSessions.$inferSelect;
export type NewDropInSession = typeof dropInSessions.$inferInsert;
export type DropInBooking = typeof dropInBookings.$inferSelect;
export type NewDropInBooking = typeof dropInBookings.$inferInsert;
export type DropInRateCard = typeof dropInRateCard.$inferSelect;
export type BrandProfile = typeof brandProfiles.$inferSelect;
export type NewBrandProfile = typeof brandProfiles.$inferInsert;
export type UserSkillLevel = typeof userSkillLevels.$inferSelect;

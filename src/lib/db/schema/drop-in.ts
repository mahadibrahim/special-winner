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
import { familyMembers } from "./registrations";
import { mediaAssets } from "./media";
import { venueResources } from "./scheduling";
import { classSlotTemplates } from "./classes";

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
  // Materialized by the class-slot cron (auto-booking an enrolled child into
  // a newly-created weekly session) — see src/lib/classes/book-child.ts.
  "auto_enrollment",
]);
export const dropInPaymentMethodEnum = pgEnum("drop_in_payment_method", [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
  // Host's free seat in a game they host (GoodRec model) — created/cancelled
  // by src/lib/dropin/host-assignment.ts, always amount_paid_cents = 0.
  "host_comp",
  "trial",
  // Class session paid from a purchased credit grant (pack or block) —
  // see src/lib/db/schema/classes.ts classCreditGrants.
  "pack_credit",
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
    // Community host running this game (GoodRec model). Writes must verify
    // the user holds an ACTIVE host_profiles row in this org — enforced in
    // src/lib/dropin/host-assignment.ts, never set this column directly.
    hostUserId: uuid("host_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Set when the session was materialized from a recurring class slot
    // template (kind='class' home-slot machinery). NULL for every pickup
    // session and for one-off classes created directly in admin.
    classSlotTemplateId: uuid("class_slot_template_id").references(
      () => classSlotTemplates.id,
      { onDelete: "set null" },
    ),
    // Stamped when the one-and-only "needs players" alert blast for this
    // session is claimed by the cron (stamp-then-send; see fill-alerts.ts).
    fillAlertSentAt: timestamp("fill_alert_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("drop_in_sessions_org_starts_at_idx").on(table.organizationId, table.startsAt),
    index("drop_in_sessions_venue_starts_at_idx").on(table.venueId, table.startsAt),
    index("drop_in_sessions_status_idx").on(table.status),
    // Materialization idempotency: at most one session per template per
    // start instant — the cron upserts against this.
    uniqueIndex("drop_in_sessions_one_per_template_start")
      .on(table.classSlotTemplateId, table.startsAt)
      .where(sql`class_slot_template_id IS NOT NULL`),
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
    // WHO the booking is actually for, when that is not the booking's user.
    // A kiosk walk-in for a MINOR books under the PARENT (userId = parent,
    // because the parent is who pays and who receives the pay link), while
    // the player is a family_members row on the COPPA (parent_user_id) path
    // — see walkin/start.ts. Without this column the child is unreachable
    // from the booking, and resolveSigner() had no choice but to report the
    // parent as the participant: the guardian got the ADULT waiver and the
    // child's kiosk photo landed on the parent's avatar.
    // NULL = the booking's user IS the participant (every adult walk-in and
    // every online drop-in booking — those flows are adult-only).
    familyMemberId: uuid("family_member_id").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    status: dropInBookingStatusEnum("status").notNull(),
    source: dropInBookingSourceEnum("source").notNull(),
    paymentMethod: dropInPaymentMethodEnum("payment_method").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    // Soft reference — no FK. See memberships.ts (memberships table, has
    // existed since Phase 3); kept soft here to avoid a cross-cutting
    // migration on this already-populated table.
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
    // Which consent language the signer actually saw (#398): 'adult' |
    // 'guardian', plus the literal assent sentence. Guardian language became
    // genuinely reachable with PR #396 (before it every walk-in minor was
    // shown the adult line); this records which one was agreed to. Null on
    // rows signed before this shipped.
    waiverConsentVariant: varchar("waiver_consent_variant", { length: 10 }),
    waiverConsentText: text("waiver_consent_text"),
    // Storefront brand the booking was made through. Default covers
    // pre-cutover rows and at-facility walk-ups (no host signal).
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    // ?src= attribution present at booking time (host-share | fill-alert | …).
    referralSource: varchar("referral_source", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // _v3: keyed on the PARTICIPANT, not the booker (#397). The v2 index on
    // (session_id, user_id) made it impossible for a parent to walk in two
    // children — both bookings carry the parent's user_id, so the second
    // child violated the index (and the app guard 409'd it first).
    // COALESCE(family_member_id, user_id) is the participant identity:
    // family_member_id names the child on minor bookings; NULL means "the
    // booking's user is the participant" (every adult walk-in and online
    // drop-in), preserving one-active-booking-per-adult exactly as before.
    // The rename-on-change rule is load-bearing (see 0086's history):
    // db-migrate-bootstrap.ts verifies index migrations by NAME only, so a
    // same-name drop+recreate would be silently skipped on populated DBs.
    uniqueIndex("drop_in_bookings_one_active_per_participant_session_v3")
      .on(table.sessionId, sql`COALESCE(${table.familyMemberId}, ${table.userId})`)
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
  // Fill-alert config: a scheduled pickup session qualifies for the alert
  // blast when it starts within `fillAlertWindowHours` and its seat count is
  // under `fillAlertThresholdPct` % of capacity.
  fillAlertWindowHours: integer("fill_alert_window_hours").notNull().default(24),
  fillAlertThresholdPct: integer("fill_alert_threshold_pct").notNull().default(60),
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

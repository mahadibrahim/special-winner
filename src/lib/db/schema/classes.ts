import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  time,
  date,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { familyMembers } from "./registrations";
import { memberships } from "./memberships";
import { users } from "./users";

export const classEnrollmentStatusEnum = pgEnum("class_enrollment_status", [
  "active",
  "ended",
]);

// "comp" = admin-issued goodwill credits (service recovery, a missed class we
// owe back). No Stripe Checkout Session behind them — hence the nullable
// stripe_checkout_session_id and the grantedByUserId attribution column on
// class_credit_grants below.
export const classCreditSourceEnum = pgEnum("class_credit_source", ["pack", "block", "comp"]);

/**
 * A recurring weekly class slot ("Soccer Skills 6–8, Tue 17:00, cap 12").
 * The cron materializes one drop_in_sessions row (kind='class') per active
 * template per week; enrolled children are auto-booked into it while their
 * monthly class allotment lasts.
 *
 * References venues (not locations): the cron inserts a drop_in_sessions row
 * per materialization, and dropInSessions.venueId is NOT NULL — a location
 * does not deterministically resolve to a venue (venues.locationId is a
 * plain, non-unique index; admin can and does create multiple venues per
 * location, see POST /api/admin/venues). Every other table that needs to
 * unambiguously name a physical facility (drop_in_sessions, field_rentals,
 * venue_resources) already keys on venueId for the same reason, and
 * requireSameOrgVenue exists alongside requireSameOrgLocation for ownership
 * checks — so venueId is the established shape here, not a special case.
 */
export const classSlotTemplates = pgTable(
  "class_slot_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sportLabel: text("sport_label").notNull().default("Soccer"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    /** 0=Sunday … 6=Saturday, matching JS Date#getUTCDay. */
    weekday: integer("weekday").notNull(),
    /** Local wall-clock start, org timezone (repo convention: UTC storage,
     *  org-tz display — but slot times are WALL times, so store the wall
     *  time and resolve to an instant at materialization). */
    startTime: time("start_time").notNull(),
    durationMins: integer("duration_mins").notNull().default(55),
    capacity: integer("capacity").notNull(),
    /**
     * Per-class pricing for the PAID paths — the make-up booking a parent
     * buys when the child's monthly allotment is exhausted
     * (POST /api/dropin/bookings with familyMemberId), and the quote the
     * 402 from POST /api/classes/book hands the client.
     *
     * These are the CLASS rate source. Without them the only fallback is
     * `drop_in_rate_card`, which is the ADULT PICKUP rate card — a paid
     * kids' class make-up would silently be charged the adult drop-in
     * price. Copied onto each materialized `drop_in_sessions` row by the
     * cron (src/lib/classes/materialize.ts), so the booking endpoints keep
     * reading rates off the SESSION exactly as they do for pickup; the
     * rate-card fallback stays as the last resort for a template (or a
     * one-off class session) that leaves them null.
     *
     * Nullable on purpose: a template that predates this column, or an org
     * that genuinely wants the rate-card default, keeps working.
     */
    sessionRateCents: integer("session_rate_cents"),
    memberRateCents: integer("member_rate_cents"),
    /** Per-session rate for BLOCK purchases of this template. Null falls
     *  back to sessionRateCents at quote time. */
    blockRateCents: integer("block_rate_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_slot_templates_org_active_idx").on(table.organizationId, table.active),
  ],
);

/** Admin-defined class-pack catalog (N floating session credits for one
 *  child). Mirrors membership_tiers' Stripe reconciliation shape. */
export const classPackProducts = pgTable(
  "class_pack_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sessionCount: integer("session_count").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Credits expire this many months after purchase. */
    expiryMonths: integer("expiry_months").notNull().default(6),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_pack_products_org_active_idx").on(table.organizationId, table.active),
  ],
);

/** Admin-defined org-wide block window ("Fall Block", Sep 15 – Nov 7).
 *  Dates are civil dates in the org's timezone; instants resolve at
 *  purchase time via the same wall-clock machinery the cron uses. */
export const classBlocks = pgTable(
  "class_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_blocks_org_active_idx").on(table.organizationId, table.active, table.startDate),
  ],
);

/** Per-child credits ledger. Balance is COUNT-DERIVED: remaining =
 *  sessionsGranted − active bookings whose creditGrantId references this
 *  row (statuses confirmed/waitlisted/pending_claim/pending_payment/
 *  no_show; a cancelled booking returns the credit automatically). Same
 *  derive-don't-store pattern (and accepted TOCTOU tolerance) as the
 *  monthly allotment in src/lib/memberships/allotment.ts. */
export const classCreditGrants = pgTable(
  "class_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    source: classCreditSourceEnum("source").notNull(),
    // restrict (not set-null): a raced admin DELETE on the pack/block must
    // not silently orphan a paid grant's attribution. The app-level 409 in
    // the pack/block DELETE endpoints (loadOwned + classCreditGrants count
    // check) is the primary guard; this FK is the race backstop.
    packProductId: uuid("pack_product_id").references(() => classPackProducts.id, {
      onDelete: "restrict",
    }),
    blockId: uuid("block_id").references(() => classBlocks.id, { onDelete: "restrict" }),
    /** Set on block grants: credits are pinned to this weekly slot. NULL on
     *  pack grants (floating — any class session). Deliberately still
     *  set-null: unlike pack/block, losing the slot-template pin on grant
     *  attribution is not a paid-record integrity issue. */
    slotTemplateId: uuid("slot_template_id").references(() => classSlotTemplates.id, {
      onDelete: "set null",
    }),
    sessionsGranted: integer("sessions_granted").notNull(),
    pricePaidCents: integer("price_paid_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** NULL on source='comp' grants — an admin issues those directly, no
     *  Checkout Session exists. Still set (and still unique, via the partial
     *  index below) on every pack/block grant, which is what makes the
     *  purchase webhooks idempotent. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    /** set on source='comp' rows; the admin who issued them */
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Stamp-then-send marker for the block-abandon nudge
     * (src/lib/classes/block-nudge.ts): set the instant the ONE-EVER nudge
     * email fires for this grant's enrollment, so a crashed send can't
     * double-fire and a second cron tick can't re-claim an already-claimed
     * grant. NULL = not yet nudged. Lives here (not on class_enrollments)
     * because the grant, not the enrollment, is the thing that is "one per
     * ever" scoped — an enrollment can end and a new one start against the
     * same grant's leftover credits (see the end-enrollment float), and the
     * nudge should not re-fire just because a fresh enrollment row exists
     * for credits that already got their one nudge.
     */
    nudgeSentAt: timestamp("nudge_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Webhook idempotency: one grant per Checkout Session, replays no-op.
    // PARTIAL since comp grants carry no session id — many NULLs would each
    // be distinct under a plain unique index in Postgres, but the predicate
    // states the intent and keeps the index to the rows that need it.
    // _v2 is load-bearing: db-migrate-bootstrap.ts verifies index migrations
    // by NAME only, so a same-name drop+recreate is silently skipped on a
    // populated DB and the old total index survives. Any future change to
    // this index's columns or predicate must bump the name again.
    uniqueIndex("class_credit_grants_checkout_session_uq_v2")
      .on(table.stripeCheckoutSessionId)
      .where(sql`stripe_checkout_session_id IS NOT NULL`),
    index("class_credit_grants_child_idx").on(table.familyMemberId, table.expiresAt),
  ],
);

/**
 * A child's standing home-slot enrollment. Capacity = count of ACTIVE
 * enrollments per template, checked transactionally against
 * classSlotTemplates.capacity.
 */
export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotTemplateId: uuid("slot_template_id")
      .notNull()
      .references(() => classSlotTemplates.id, { onDelete: "restrict" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    // Nullable since the purchase-ladder work: a block purchase creates an
    // enrollment backed by a credit grant instead of a membership. Exactly
    // one of (membershipId, creditGrantId) is set — enforced by the CHECK
    // below, mirroring family_members_self_xor_parent.
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "restrict",
    }),
    creditGrantId: uuid("credit_grant_id").references(() => classCreditGrants.id, {
      onDelete: "restrict",
    }),
    status: classEnrollmentStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("class_enrollments_one_active_per_child_template")
      .on(table.slotTemplateId, table.familyMemberId)
      .where(sql`status = 'active'`),
    index("class_enrollments_child_idx").on(table.familyMemberId, table.status),
    index("class_enrollments_template_status_idx").on(table.slotTemplateId, table.status),
    check(
      "class_enrollments_membership_xor_grant",
      sql`(membership_id IS NOT NULL) <> (credit_grant_id IS NOT NULL)`,
    ),
  ],
);

export type ClassSlotTemplate = typeof classSlotTemplates.$inferSelect;
export type NewClassSlotTemplate = typeof classSlotTemplates.$inferInsert;
export type ClassEnrollment = typeof classEnrollments.$inferSelect;
export type ClassPackProduct = typeof classPackProducts.$inferSelect;
export type ClassBlock = typeof classBlocks.$inferSelect;
export type ClassCreditGrant = typeof classCreditGrants.$inferSelect;

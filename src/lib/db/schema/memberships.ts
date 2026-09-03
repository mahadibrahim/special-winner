import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { familyMembers } from "./registrations";

// === enums ===

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "paused",
  "past_due",
  "cancelled",
  "incomplete",
]);

export const membershipBillingIntervalEnum = pgEnum(
  "membership_billing_interval",
  ["month", "year"],
);

// === tables ===

/**
 * Per-organization membership tier configuration.
 *
 * The `benefits` JSONB blob is the source of truth for what the tier
 * unlocks. Keys are optional; missing keys fall back to 0 / false /
 * undefined and the consuming code (rentals discount, drop-in resolver,
 * etc.) treats them as "no benefit". Known keys (extend as features
 * land):
 *   - rental_discount_pct:        integer 0–100
 *   - priority_league_signup_hrs: integer (hours of early access)
 *   - guest_passes_per_month:     integer
 *   - booking_window_days:        integer
 *   - members_only_pickup:        boolean
 *   - unlimited_pickup:           boolean
 *   - free_pickup_per_month:      integer
 *   - classes_per_month:          integer
 *   - unlimited_classes:          boolean
 *   - camp_discount_pct:          integer 0–100
 */
export const membershipTiers = pgTable(
  "membership_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monthlyPriceCents: integer("monthly_price_cents"),
    annualPriceCents: integer("annual_price_cents"),
    annualFeeCents: integer("annual_fee_cents"),
    tagline: text("tagline"),
    benefits: jsonb("benefits").notNull().default(sql`'{}'::jsonb`),
    stripePriceIdMonthly: text("stripe_price_id_monthly"),
    stripePriceIdAnnual: text("stripe_price_id_annual"),
    stripePriceIdFee: text("stripe_price_id_fee"),
    /** Monthly technical-training supplement (+$9/mo per weekly technical
     *  slot). Null/0 = tier has no premium (adult tiers, unlimited). */
    technicalMonthlyCents: integer("technical_monthly_cents"),
    stripePriceIdTechnical: text("stripe_price_id_technical"),
    stripeProductId: text("stripe_product_id"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("membership_tiers_org_active_idx").on(
      table.organizationId,
      table.isActive,
      table.displayOrder,
    ),
  ],
);

/**
 * One row per user × org subscription. `organization_id` is denormalized
 * (it must match `tier.organization_id`) so we can enforce
 * "one active per user per org" via a partial unique index without a
 * subquery.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    familyMemberId: uuid("family_member_id").references(
      () => familyMembers.id,
      { onDelete: "restrict" },
    ),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id, { onDelete: "restrict" }),
    status: membershipStatusEnum("status").notNull().default("incomplete"),
    billingInterval: membershipBillingIntervalEnum("billing_interval").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    feeNextDueAt: timestamp("fee_next_due_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pauseResumesAt: timestamp("pause_resumes_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Adult (self) memberships: unchanged one-active-per-user-per-org rule.
    uniqueIndex("memberships_one_active_per_user_org")
      .on(table.userId, table.organizationId)
      .where(
        sql`status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NULL`,
      ),
    // Child memberships: one active per child per org.
    uniqueIndex("memberships_one_active_per_child_org")
      .on(table.organizationId, table.familyMemberId)
      .where(
        sql`status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NOT NULL`,
      ),
    index("memberships_family_member_idx").on(table.familyMemberId),
    index("memberships_user_status_idx").on(table.userId, table.status),
    index("memberships_org_status_idx").on(table.organizationId, table.status),
  ],
);

// Type exports
export type MembershipTier = typeof membershipTiers.$inferSelect;
export type NewMembershipTier = typeof membershipTiers.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

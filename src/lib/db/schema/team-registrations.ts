import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
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
  brand: varchar("brand", { length: 20 }), // 'aspire' | 'soccerone' — set from host at creation

  // Phase B — captain payment backstop (TeamPayer model)
  // teamFeeCents holds the EFFECTIVE team total the roster splits: the
  // early-bird snapshot at creation, minus any discount applied on the reserve
  // step. discountCents records how much was taken off (original fee =
  // teamFeeCents + discountCents), so the breakdown survives a reload.
  teamFeeCents: integer("team_fee_cents"),                 // effective team total (early-bird − discount)
  // Captain-set price for anyone joining through the open share link who has
  // no captain-assigned invitee share. NULL ⇒ the season's individual price
  // (what Casey paid). An explicit invitee share always wins over this.
  joinShareCents: integer("join_share_cents"),
  discountCodeId: uuid("discount_code_id"),                // soft ref to discount_codes.id (applied on reserve)
  discountCents: integer("discount_cents"),                // amount taken off the team fee, if any
  depositCents: integer("deposit_cents").default(20000),   // $200 (locked decision)
  // Stripe deposit PaymentIntent id. The team is created ONLY when this intent
  // succeeds (deferred-account flow), so both the browser finalize call and the
  // webhook backstop dedupe on it — unique, first writer creates the team.
  depositPaymentIntentId: varchar("deposit_payment_intent_id", { length: 255 }),
  depositPaymentId: uuid("deposit_payment_id"),            // soft ref to payments.id, set after charge
  captainStripeCustomerId: varchar("captain_stripe_customer_id", { length: 255 }),
  captainPaymentMethodId: varchar("captain_payment_method_id", { length: 255 }),
  paymentDeadline: timestamp("payment_deadline"),          // = season.registrationCloses at creation
  backstopStatus: varchar("backstop_status", { length: 20 }).default("none").notNull(),
  // 'none' | 'pending' | 'charged' | 'failed'
  // Captain's explicit affirmation that the saved card may be charged for
  // unpaid teammate shares after the deadline (off-session backstop). Recorded
  // at team creation; legacy rows predate the checkbox and stay null.
  backstopConsentedAt: timestamp("backstop_consented_at", { withTimezone: true }),

  // Deposit refund tracking (winter-team-fixes). The $200 deposit
  // (depositCents above) can be walked back after the fact — a captain
  // cancels before the roster fills, an admin issues a goodwill refund, or
  // the team never delivers and the deposit is kept outright. These four
  // columns are the ledger for that outcome; they are set together by
  // whichever admin/webhook path performs the refund, not incrementally.
  depositRefundStatus: varchar("deposit_refund_status", { length: 20 })
    .default("none")
    .notNull(),
  // 'none' — no refund action taken (the common case; deposit stands as
  //   paid, whether or not the team ever completed).
  // 'processing' — the executor (maybeRefundTeamDeposit in
  //   src/lib/payments/team-deposit-refund.ts) has claimed this row and is
  //   mid-flight. NOT a stable resting state, but the two ways a row lands
  //   here are NOT treated identically: a FRESH 'processing' row (updated
  //   within the last 10 minutes) means a genuinely concurrent call owns
  //   it right now — other callers skip it untouched ("in_flight"). Only a
  //   STALE 'processing' row (older than 10 minutes — the prior claimant
  //   crashed or was killed before finishing) is claimable again, and that
  //   reclaim happens via the SAME atomic SQL UPDATE as a fresh 'none' claim
  //   (WHERE status='none' OR (status='processing' AND updated_at is
  //   stale)) — a recovery claimant is a real, full owner of the row, not a
  //   caller merely "allowed to peek." A row should never sit here
  //   indefinitely; if one does, something upstream stopped re-triggering
  //   it (see the caller contract in the executor's module doc).
  // 'refunded' — the full deposit was returned to the captain.
  // 'partially_refunded' — some but not all of the deposit was returned
  //   (e.g. a cancellation fee was retained).
  // 'forfeited' — the deposit was kept in full; no money moved, but this
  //   marks the deposit as resolved/closed rather than pending.
  depositRefundId: varchar("deposit_refund_id", { length: 255 }), // Stripe refund id, when a refund was actually issued
  depositRefundedCents: integer("deposit_refunded_cents"),        // amount actually returned; NULL for 'forfeited' (nothing was returned) as well as 'none'/'processing'; only set for 'refunded'/'partially_refunded'
  depositRefundedAt: timestamp("deposit_refunded_at", { withTimezone: true }), // WHEN THE DEPOSIT QUESTION SETTLED — a refund, a partial refund, or a forfeiture all stamp this; it marks "resolved," not "money moved"

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // One team per deposit PaymentIntent — the finalize endpoint and the webhook
  // backstop both create-if-absent keyed on this, so the unique index is what
  // makes "exactly one team per successful deposit" true under a race.
  uniqueIndex("team_registrations_deposit_pi_uniq").on(t.depositPaymentIntentId),
]);

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

export const teamInvitees = pgTable("team_invitees", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamRegistrationId: uuid("team_registration_id")
    .notNull()
    .references(() => teamRegistrations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  assignedShareCents: integer("assigned_share_cents").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  // 'pending' | 'paid' | 'charged_to_captain'
  registrationId: uuid("registration_id").references(() => registrations.id, { onDelete: "set null" }),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("team_invitees_team_idx").on(t.teamRegistrationId),
  uniqueIndex("team_invitees_team_email_uniq").on(t.teamRegistrationId, t.email),
]);

export type TeamRegistration = typeof teamRegistrations.$inferSelect;
export type NewTeamRegistration = typeof teamRegistrations.$inferInsert;
export type TeamRegistrationMember = typeof teamRegistrationMembers.$inferSelect;
export type NewTeamRegistrationMember = typeof teamRegistrationMembers.$inferInsert;
export type TeamInvitee = typeof teamInvitees.$inferSelect;
export type NewTeamInvitee = typeof teamInvitees.$inferInsert;

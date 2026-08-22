import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";

// === enums ===

export const fieldRentalStatusEnum = pgEnum("field_rental_status", [
  "requested",
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export const fieldRentalSourceEnum = pgEnum("field_rental_source", [
  "online_booking",
  "admin_created",
]);
export const fieldRentalPaymentMethodEnum = pgEnum("field_rental_payment_method", [
  "card_online",
  "card_present",
  "cash",
  "comp",
]);
export const fieldRentalPaymentStatusEnum = pgEnum("field_rental_payment_status", [
  "unpaid",
  "paid",
  "refunded",
]);
export const fieldRentalCancellationReasonEnum = pgEnum(
  "field_rental_cancellation_reason",
  ["user_request", "admin_override", "venue_unavailable"],
);
export const fieldRentalPlayerStatusEnum = pgEnum("field_rental_player_status", [
  "pending",
  "signed",
]);

// === tables ===

export const fieldRentals = pgTable(
  "field_rentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    fieldNumber: integer("field_number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: fieldRentalStatusEnum("status").notNull(),
    source: fieldRentalSourceEnum("source").notNull(),
    renterUserId: uuid("renter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    renterName: text("renter_name").notNull(),
    renterEmail: text("renter_email"),
    renterPhone: text("renter_phone"),
    partySize: integer("party_size").notNull().default(1),
    purpose: text("purpose"),
    notes: text("notes"),
    paymentMethod: fieldRentalPaymentMethodEnum("payment_method").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    paymentStatus: fieldRentalPaymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    // When a `requested` row auto-releases if no admin approves/declines it.
    // Distinct from paymentExpiresAt so the request-hold sweep and the
    // payment-hold sweep never key off the same column.
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true }),
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    waiverSignedAt: timestamp("waiver_signed_at", { withTimezone: true }),
    waiverSignedBy: text("waiver_signed_by"),
    // Which consent language the signer actually saw (#398): 'adult' |
    // 'guardian', plus the literal assent sentence. A liability record that
    // can't prove which words were agreed to proves very little. Null on
    // rows signed before this shipped.
    waiverConsentVariant: varchar("waiver_consent_variant", { length: 10 }),
    waiverConsentText: text("waiver_consent_text"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInByUserId: uuid("checked_in_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: fieldRentalCancellationReasonEnum("cancellation_reason"),
    // Storefront brand the rental was booked through. Default covers
    // pre-cutover rows and at-facility bookings (no host signal).
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    // Parent block when this session belongs to a recurring rental block.
    // Nullable: standalone rentals have none. The payment-hold sweep skips
    // rows with a block, because the block-level sweep cancels those together.
    // The FK is declared in SQL rather than via .references() to avoid a
    // circular import between field-rentals.ts and field-rental-blocks.ts.
    blockId: uuid("block_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("field_rentals_venue_starts_at_idx").on(table.venueId, table.startsAt),
    index("field_rentals_block_starts_at_idx").on(table.blockId, table.startsAt),
    index("field_rentals_org_starts_at_idx").on(table.organizationId, table.startsAt),
    index("field_rentals_renter_starts_at_idx").on(table.renterUserId, table.startsAt),
    index("field_rentals_active_field_idx")
      .on(table.venueId, table.fieldNumber, table.startsAt)
      .where(sql`status IN ('requested', 'pending_payment', 'confirmed')`),
  ],
);

export const fieldRentalPlayers = pgTable(
  "field_rental_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => fieldRentals.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    isMinor: boolean("is_minor").notNull().default(false),
    // Adult's own email, or the parent/guardian's for a minor.
    signerEmail: text("signer_email").notNull(),
    status: fieldRentalPlayerStatusEnum("status").notNull().default("pending"),
    // Captured at signing (the parent's name when isMinor).
    signerName: text("signer_name"),
    waiverId: uuid("waiver_id"),
    contentHash: text("content_hash"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedIp: text("signed_ip"),
    signedUa: text("signed_ua"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_rental_players_rental_idx").on(t.rentalId),
    index("field_rental_players_pending_idx")
      .on(t.rentalId)
      .where(sql`status = 'pending'`),
  ],
);

export type FieldRentalPlayer = typeof fieldRentalPlayers.$inferSelect;
export type NewFieldRentalPlayer = typeof fieldRentalPlayers.$inferInsert;

export const fieldRentalRateCard = pgTable("field_rental_rate_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  defaultHourlyRateCents: integer("default_hourly_rate_cents").notNull().default(8000),
  cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
  bookingIncrementMinutes: integer("booking_increment_minutes").notNull().default(60),
  minDurationMinutes: integer("min_duration_minutes").notNull().default(60),
  maxDurationMinutes: integer("max_duration_minutes").notNull().default(240),
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(60),
  // Hours a `requested` (un-approved) rental holds its slot before the sweep
  // auto-cancels it and frees the field.
  requestHoldHours: integer("request_hold_hours").notNull().default(24),
  // Minimum hours in advance a slot may be requested online. Sooner than this
  // → "contact the venue". Gives runway for approve + 24h pay window.
  minLeadTimeHours: integer("min_lead_time_hours").notNull().default(48),
  // Recurring rental blocks. Deposit as a percent of the block total; balance
  // due this many days before the first session; how long an unpaid
  // awaiting_deposit block holds its slots; how long a draft's soft-hold
  // quote markers stay visible.
  depositPct: integer("deposit_pct").notNull().default(25),
  balanceDueLeadDays: integer("balance_due_lead_days").notNull().default(30),
  blockHoldHours: integer("block_hold_hours").notNull().default(72),
  quoteMarkerTtlDays: integer("quote_marker_ttl_days").notNull().default(14),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// Type exports
export type FieldRental = typeof fieldRentals.$inferSelect;
export type NewFieldRental = typeof fieldRentals.$inferInsert;
export type FieldRentalRateCard = typeof fieldRentalRateCard.$inferSelect;

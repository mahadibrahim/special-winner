import {
  pgTable,
  pgEnum,
  uuid,
  text,
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
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    waiverSignedAt: timestamp("waiver_signed_at", { withTimezone: true }),
    waiverSignedBy: text("waiver_signed_by"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInByUserId: uuid("checked_in_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: fieldRentalCancellationReasonEnum("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("field_rentals_venue_starts_at_idx").on(table.venueId, table.startsAt),
    index("field_rentals_org_starts_at_idx").on(table.organizationId, table.startsAt),
    index("field_rentals_renter_starts_at_idx").on(table.renterUserId, table.startsAt),
    index("field_rentals_active_field_idx")
      .on(table.venueId, table.fieldNumber, table.startsAt)
      .where(sql`status IN ('pending_payment', 'confirmed')`),
  ],
);

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// Type exports
export type FieldRental = typeof fieldRentals.$inferSelect;
export type NewFieldRental = typeof fieldRentals.$inferInsert;
export type FieldRentalRateCard = typeof fieldRentalRateCard.$inferSelect;

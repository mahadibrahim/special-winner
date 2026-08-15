import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations, locations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";
import { fieldRentalPaymentMethodEnum } from "./field-rentals";

export const fieldRentalBlockStatusEnum = pgEnum("field_rental_block_status", [
  "draft",
  "awaiting_deposit",
  "active",
  "completed",
  "cancelled",
]);

export const fieldRentalBlocks = pgTable(
  "field_rental_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    brand: varchar("brand", { length: 20 }).notNull().default("soccerone"),
    label: text("label").notNull(),

    renterUserId: uuid("renter_user_id").references(() => users.id, { onDelete: "set null" }),
    renterName: text("renter_name").notNull(),
    renterEmail: text("renter_email"),
    renterPhone: text("renter_phone"),
    partySize: integer("party_size").notNull().default(1),
    purpose: text("purpose"),
    notes: text("notes"),

    // Generator input plus the admin's per-row edits, so a draft can be reopened.
    pattern: jsonb("pattern"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountKind: varchar("discount_kind", { length: 10 }),
    discountValue: integer("discount_value"),
    totalCents: integer("total_cents").notNull().default(0),

    depositPctSnapshot: integer("deposit_pct_snapshot"),
    depositDueCents: integer("deposit_due_cents").notNull().default(0),
    depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
    depositExpiresAt: timestamp("deposit_expires_at", { withTimezone: true }),
    stripeDepositPiId: text("stripe_deposit_pi_id"),

    balanceDueCents: integer("balance_due_cents").notNull().default(0),
    balanceDueAt: timestamp("balance_due_at", { withTimezone: true }),
    balancePaidAt: timestamp("balance_paid_at", { withTimezone: true }),
    stripeBalancePiId: text("stripe_balance_pi_id"),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    reminderStage: varchar("reminder_stage", { length: 20 }),

    status: fieldRentalBlockStatusEnum("status").notNull().default("draft"),
    offlinePaymentMethod: fieldRentalPaymentMethodEnum("offline_payment_method"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_rental_blocks_org_status_idx").on(t.organizationId, t.status),
    index("field_rental_blocks_location_status_idx").on(t.locationId, t.status),
    index("field_rental_blocks_balance_due_idx").on(t.balanceDueAt),
  ],
);

/**
 * Non-blocking soft holds for draft quotes. Deliberately NOT resource_blocks
 * rows: assertNoBlockConflict treats every unexpired ledger row as a hard
 * conflict, which would block competing quotes. Read for display only.
 */
export const fieldRentalBlockQuoteSlots = pgTable(
  "field_rental_block_quote_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => fieldRentalBlocks.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    fieldNumber: integer("field_number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("field_rental_block_quote_slots_venue_starts_idx").on(t.venueId, t.startsAt),
    index("field_rental_block_quote_slots_block_idx").on(t.blockId),
  ],
);

export type FieldRentalBlock = typeof fieldRentalBlocks.$inferSelect;
export type NewFieldRentalBlock = typeof fieldRentalBlocks.$inferInsert;
export type FieldRentalBlockQuoteSlot = typeof fieldRentalBlockQuoteSlots.$inferSelect;

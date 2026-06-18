import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { registrations } from "./registrations";
import { teamRegistrations } from "./team-registrations";

// Enums
export const paymentTypeEnum = pgEnum("payment_type", [
  "deposit",
  "full",
  "balance",
  "refund",
  "installment",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "cancelled",
]);

export const paymentPlanStatusEnum = pgEnum("payment_plan_status", [
  "active",
  "completed",
  "cancelled",
  "defaulted",
]);

export const scheduledPaymentStatusEnum = pgEnum("scheduled_payment_status", [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);

// Stripe dispute statuses, taken verbatim from
// https://stripe.com/docs/api/disputes/object#dispute_object-status .
// Adding new values: append; do not reorder (Postgres enum ordering is
// physical, but our code only reads the string value).
export const disputeStatusEnum = pgEnum("dispute_status", [
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
]);

// Payments table
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .references(() => registrations.id, { onDelete: "restrict" }),
    teamRegistrationId: uuid("team_registration_id").references(
      () => teamRegistrations.id,
      { onDelete: "set null" },
    ),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    status: transactionStatusEnum("status").default("pending").notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    refundReason: text("refund_reason"),
    // Stripe dispute tracking — populated by the charge.dispute.* webhook
    // handler. NULL until/unless the card-holder disputes the charge.
    // `dispute_reason_code` stores Stripe's reason verbatim (e.g.
    // "fraudulent", "duplicate", "subscription_canceled") — kept as a
    // varchar rather than an enum because Stripe adds reason codes over
    // time and we don't want a migration every time they do.
    stripeDisputeId: varchar("stripe_dispute_id", { length: 255 }),
    disputeStatus: disputeStatusEnum("dispute_status"),
    disputeReasonCode: varchar("dispute_reason_code", { length: 64 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("payments_registration_idx").on(table.registrationId),
    index("payments_team_registration_idx").on(table.teamRegistrationId),
    index("payments_user_idx").on(table.userId),
    // A Stripe PaymentIntent / Charge maps to at most one payment row.
    // Partial — NULL ids (e.g. comped registrations) are exempt.
    uniqueIndex("payments_stripe_payment_intent_uniq")
      .on(table.stripePaymentIntentId)
      .where(sql`stripe_payment_intent_id IS NOT NULL`),
    uniqueIndex("payments_stripe_charge_uniq")
      .on(table.stripeChargeId)
      .where(sql`stripe_charge_id IS NOT NULL`),
    // A Stripe dispute maps to at most one payment row. NULL ids exempt.
    uniqueIndex("payments_stripe_dispute_uniq")
      .on(table.stripeDisputeId)
      .where(sql`stripe_dispute_id IS NOT NULL`),
  ],
);

// Payment plans (for installments)
export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "restrict" }),
    totalInstallments: integer("total_installments").notNull(),
    installmentAmountCents: integer("installment_amount_cents").notNull(),
    nextPaymentDate: date("next_payment_date"),
    status: paymentPlanStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("payment_plans_registration_idx").on(table.registrationId),
  ],
);

// Scheduled payments
export const scheduledPayments = pgTable(
  "scheduled_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentPlanId: uuid("payment_plan_id")
      .notNull()
      .references(() => paymentPlans.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: scheduledPaymentStatusEnum("status").default("pending").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    retryCount: integer("retry_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("scheduled_payments_payment_plan_idx").on(table.paymentPlanId),
    index("scheduled_payments_status_due_date_idx").on(
      table.status,
      table.dueDate,
    ),
  ],
);

// Relations
export const paymentsRelations = relations(payments, ({ one }) => ({
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.id],
  }),
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const paymentPlansRelations = relations(paymentPlans, ({ one, many }) => ({
  registration: one(registrations, {
    fields: [paymentPlans.registrationId],
    references: [registrations.id],
  }),
  scheduledPayments: many(scheduledPayments),
}));

export const scheduledPaymentsRelations = relations(scheduledPayments, ({ one }) => ({
  paymentPlan: one(paymentPlans, {
    fields: [scheduledPayments.paymentPlanId],
    references: [paymentPlans.id],
  }),
  payment: one(payments, {
    fields: [scheduledPayments.paymentId],
    references: [payments.id],
  }),
}));

// Type exports
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type NewPaymentPlan = typeof paymentPlans.$inferInsert;
export type ScheduledPayment = typeof scheduledPayments.$inferSelect;
export type NewScheduledPayment = typeof scheduledPayments.$inferInsert;

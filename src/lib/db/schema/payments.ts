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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { registrations } from "./registrations";

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

// Payments table
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    status: transactionStatusEnum("status").default("pending").notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    refundReason: text("refund_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("payments_registration_idx").on(table.registrationId),
    index("payments_user_idx").on(table.userId),
    index("payments_stripe_payment_intent_idx").on(table.stripePaymentIntentId),
    index("payments_stripe_charge_idx").on(table.stripeChargeId),
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

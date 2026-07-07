import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { registrations } from "./registrations";

// Account credit issuance rows. A ledger, not a mutable balance column —
// balance is always SUM(unexpired issued) - SUM(redeemed), computed on read.
// See src/lib/payments/account-credit.ts.
export const accountCredits = pgTable(
  "account_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("usd").notNull(),
    reason: text("reason"),
    // The registration a refund-issued credit originated from. Nullable —
    // a future manual/goodwill credit issuance may have no source registration.
    sourceRegistrationId: uuid("source_registration_id").references(
      () => registrations.id,
      { onDelete: "set null" },
    ),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // v1 scope: nothing sets this column (no expiry policy yet). Reserved so
    // an expiry policy is a later 1-line change — balance/redemption logic
    // already excludes expired rows.
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("account_credits_org_user_idx").on(table.organizationId, table.userId),
    index("account_credits_source_registration_idx").on(
      table.sourceRegistrationId,
    ),
  ],
);

// Append-only redemption rows — each references the specific issuance row it
// spent against, so one issuance can split across multiple checkouts (FIFO
// allocation) without a mutable "remaining" column on the issuance.
export const accountCreditRedemptions = pgTable(
  "account_credit_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountCreditId: uuid("account_credit_id")
      .notNull()
      .references(() => accountCredits.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id").references(() => registrations.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  },
  (table) => [
    index("account_credit_redemptions_credit_idx").on(table.accountCreditId),
    index("account_credit_redemptions_org_user_idx").on(
      table.organizationId,
      table.userId,
    ),
    index("account_credit_redemptions_registration_idx").on(
      table.registrationId,
    ),
  ],
);

// Relations
export const accountCreditsRelations = relations(accountCredits, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [accountCredits.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [accountCredits.userId],
    references: [users.id],
    relationName: "account_credit_user",
  }),
  issuedBy: one(users, {
    fields: [accountCredits.issuedByUserId],
    references: [users.id],
    relationName: "account_credit_issued_by",
  }),
  sourceRegistration: one(registrations, {
    fields: [accountCredits.sourceRegistrationId],
    references: [registrations.id],
  }),
  redemptions: many(accountCreditRedemptions),
}));

export const accountCreditRedemptionsRelations = relations(
  accountCreditRedemptions,
  ({ one }) => ({
    accountCredit: one(accountCredits, {
      fields: [accountCreditRedemptions.accountCreditId],
      references: [accountCredits.id],
    }),
    organization: one(organizations, {
      fields: [accountCreditRedemptions.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [accountCreditRedemptions.userId],
      references: [users.id],
    }),
    registration: one(registrations, {
      fields: [accountCreditRedemptions.registrationId],
      references: [registrations.id],
    }),
  }),
);

// Type exports
export type AccountCredit = typeof accountCredits.$inferSelect;
export type NewAccountCredit = typeof accountCredits.$inferInsert;
export type AccountCreditRedemption = typeof accountCreditRedemptions.$inferSelect;
export type NewAccountCreditRedemption = typeof accountCreditRedemptions.$inferInsert;

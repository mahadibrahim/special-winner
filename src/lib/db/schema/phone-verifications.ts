import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

// Short-lived OTP codes for phone number verification
export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 20 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    purpose: varchar("purpose", { length: 50 }).notNull(),
    purposeContext: jsonb("purpose_context"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("idx_phone_verifications_phone").on(
      table.phone,
      table.createdAt,
    ),
  }),
);

// Per-phone, per-org opt-in status with audit trail for 10DLC compliance
export const phoneOptIns = pgTable(
  "phone_opt_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    phone: varchar("phone", { length: 20 }).notNull(),
    // Consent is per CHANNEL. SMS (TCPA / 10DLC) and WhatsApp (Meta policy) are
    // legally distinct consents — a single status per (org, phone) cannot
    // honestly represent "yes to SMS, no to WhatsApp", and sendSms's gate reads
    // the FIRST matching row, so a WhatsApp row could otherwise authorise an SMS.
    channel: varchar("channel", { length: 20 })
      .notNull()
      .default("sms")
      .$type<PhoneOptInChannel>(),
    status: varchar("status", { length: 20 }).notNull(),
    optedInAt: timestamp("opted_in_at"),
    optedOutAt: timestamp("opted_out_at"),
    optInSource: varchar("opt_in_source", { length: 50 }),
    stopKeywordTriggered: text("stop_keyword_triggered"),
    // The literal sentence the customer saw when they ticked the box. A carrier
    // reviewer compares the live form against the consent evidence; if they
    // disagree, the evidence proves nothing.
    consentTextShown: text("consent_text_shown"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgPhoneChannelIdx: uniqueIndex("idx_phone_opt_ins_org_phone_channel").on(
      table.organizationId,
      table.phone,
      table.channel,
    ),
  }),
);

export const phoneOptInsRelations = relations(phoneOptIns, ({ one }) => ({
  organization: one(organizations, {
    fields: [phoneOptIns.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [phoneOptIns.userId],
    references: [users.id],
  }),
}));

export type PhoneVerification = typeof phoneVerifications.$inferSelect;
export type NewPhoneVerification = typeof phoneVerifications.$inferInsert;
export type PhoneOptIn = typeof phoneOptIns.$inferSelect;
export type NewPhoneOptIn = typeof phoneOptIns.$inferInsert;

export const PHONE_VERIFICATION_PURPOSE = [
  "registration",
  "phone_change",
  "recovery",
] as const;

/** Consent channels. Each is a legally distinct consent — never conflate them. */
export const PHONE_OPT_IN_CHANNEL = ["sms", "whatsapp"] as const;
export type PhoneOptInChannel = (typeof PHONE_OPT_IN_CHANNEL)[number];

export const PHONE_OPT_IN_STATUS = [
  "pending",
  "opted_in",
  "opted_out",
] as const;

export const PHONE_OPT_IN_SOURCE = [
  "registration_form",
  "verify_phone_form",
  "welcome_reply_yes",
  "admin_added",
  "admin_recovery",
] as const;

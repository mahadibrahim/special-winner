import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  date,
  jsonb,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { seasons } from "./programs";

// Enums
export const registrationStatusEnum = pgEnum("registration_status", [
  "pending",
  "confirmed",
  "waitlisted",
  "cancelled",
  "refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "deposit_paid",
  "paid",
  "partial_refund",
  "refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "none",
  "pending_approval",
  "approved",
  "processed",
  "denied",
]);

export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

// Family members (children/players or adult self-registrants)
export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly one of parentUserId or selfUserId is non-null. Enforced by
    // a DB CHECK constraint added in the migration. parentUserId means
    // "this person is a dependent of that user" (youth/COPPA path).
    // selfUserId means "this person IS that user" (adult self path).
    parentUserId: uuid("parent_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    selfUserId: uuid("self_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    birthDate: date("birth_date").notNull(),
    gender: genderEnum("gender"),
    medicalNotes: text("medical_notes"),
    emergencyContactName: varchar("emergency_contact_name", { length: 200 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
    photoUrl: text("photo_url"),
    // COPPA: verifiable parental consent audit trail. Required because a
    // parent's account-level ToS click does not, on its own, constitute the
    // separate affirmative consent COPPA requires for each child whose
    // PII we collect.
    parentalConsentGivenAt: timestamp("parental_consent_given_at"),
    parentalConsentGivenBy: uuid("parental_consent_given_by").references(
      () => users.id,
    ),
    parentalConsentIp: varchar("parental_consent_ip", { length: 64 }),
    // Photo consent is captured separately at upload time. Replaced if a
    // new photo is uploaded.
    photoConsentGivenAt: timestamp("photo_consent_given_at"),
    photoConsentGivenBy: uuid("photo_consent_given_by").references(
      () => users.id,
    ),
    photoConsentIp: varchar("photo_consent_ip", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("family_members_parent_user_idx").on(table.parentUserId),
    index("family_members_self_user_idx").on(table.selfUserId),
    check(
      "family_members_self_xor_parent",
      sql`(${table.parentUserId} IS NOT NULL AND ${table.selfUserId} IS NULL) OR (${table.parentUserId} IS NULL AND ${table.selfUserId} IS NOT NULL)`,
    ),
  ],
);

// Registrations
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    registeredByUserId: uuid("registered_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: registrationStatusEnum("status").default("pending").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").default("unpaid").notNull(),
    amountPaidCents: integer("amount_paid_cents").default(0).notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    registrationType: varchar("registration_type", { length: 20 }), // 'full', 'deposit'
    notes: text("notes"),
    waiverSigned: boolean("waiver_signed").default(false).notNull(),
    waiverSignedAt: timestamp("waiver_signed_at"),
    waiverSignedBy: varchar("waiver_signed_by", { length: 200 }),
    customFields: jsonb("custom_fields"), // For sport-specific registration data
    // Cancellation tracking
    cancelledAt: timestamp("cancelled_at"),
    cancelledReason: text("cancelled_reason"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    refundStatus: refundStatusEnum("refund_status").default("none"),
    refundAmountCents: integer("refund_amount_cents"),
    refundProcessedAt: timestamp("refund_processed_at"),
    // Waitlist management
    waitlistPosition: integer("waitlist_position"),
    waitlistPromotedAt: timestamp("waitlist_promoted_at"),
    waitlistExpiresAt: timestamp("waitlist_expires_at"),
    // Free-agent flag: adult self-registrants who want placement on a team
    lookingForTeam: boolean("looking_for_team").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("registrations_season_idx").on(table.seasonId),
    index("registrations_family_member_idx").on(table.familyMemberId),
    index("registrations_registered_by_idx").on(table.registeredByUserId),
    index("registrations_status_payment_status_idx").on(
      table.status,
      table.paymentStatus,
    ),
    index("registrations_season_status_idx").on(table.seasonId, table.status),
  ],
);

// Email logs for tracking sent emails
export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    registrationId: uuid("registration_id").references(() => registrations.id),
    emailType: varchar("email_type", { length: 50 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 500 }),
    resendMessageId: varchar("resend_message_id", { length: 255 }),
    status: varchar("status", { length: 20 }).default("sent"),
    metadata: jsonb("metadata"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_logs_user_idx").on(table.userId),
    index("email_logs_registration_idx").on(table.registrationId),
  ],
);

// Relations
export const familyMembersRelations = relations(familyMembers, ({ one, many }) => ({
  parent: one(users, {
    fields: [familyMembers.parentUserId],
    references: [users.id],
    relationName: "parent_of",
  }),
  self: one(users, {
    fields: [familyMembers.selfUserId],
    references: [users.id],
    relationName: "self_of",
  }),
  registrations: many(registrations),
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
  season: one(seasons, {
    fields: [registrations.seasonId],
    references: [seasons.id],
  }),
  familyMember: one(familyMembers, {
    fields: [registrations.familyMemberId],
    references: [familyMembers.id],
  }),
  registeredBy: one(users, {
    fields: [registrations.registeredByUserId],
    references: [users.id],
  }),
}));

// Type exports
export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;

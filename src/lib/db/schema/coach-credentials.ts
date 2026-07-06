import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * Coach compliance credentials — the system of record proving a coach on the
 * floor is cleared to be there (Phase 1 of the coach-lifecycle program).
 *
 * organizationId is nullable per the curriculum convention: NULL = a global
 * credential (e.g. a portable SafeSport cert), an org row overrides. v1 is
 * admin-entered and always org-scoped; the app-layer upsert in
 * api/admin/coaches/credentials keys on (userId, organizationId,
 * credentialType) because Postgres unique indexes treat NULLs as distinct.
 */
export const credentialTypeEnum = pgEnum("credential_type", [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
  "coaching_license",
  "other",
]);

export const credentialStatusEnum = pgEnum("credential_status", [
  "pending",
  "valid",
  "expired",
  "rejected",
]);

export const coachCredentials = pgTable(
  "coach_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ), // null = global credential
    credentialType: credentialTypeEnum("credential_type").notNull(),
    status: credentialStatusEnum("status").default("pending").notNull(),
    issuedAt: timestamp("issued_at"),
    expiresAt: timestamp("expires_at"),
    // R2 object key (reuses the careers resume plumbing) — never a signed URL,
    // those expire. The admin document endpoint redirects to a fresh one.
    documentKey: text("document_key"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_credentials_user_org_type_uniq").on(
      table.userId,
      table.organizationId,
      table.credentialType,
    ),
    index("coach_credentials_org_idx").on(table.organizationId),
    index("coach_credentials_user_idx").on(table.userId),
  ],
);

export const coachCredentialsRelations = relations(
  coachCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [coachCredentials.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [coachCredentials.organizationId],
      references: [organizations.id],
    }),
    verifiedBy: one(users, {
      fields: [coachCredentials.verifiedByUserId],
      references: [users.id],
    }),
  }),
);

export type CoachCredential = typeof coachCredentials.$inferSelect;
export type NewCoachCredential = typeof coachCredentials.$inferInsert;

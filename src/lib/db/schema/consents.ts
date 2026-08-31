import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";
import { familyMembers, registrations } from "./registrations";

export const waiverTypeEnum = pgEnum("waiver_type", [
  "liability",
  "media_authorization",
]);

export const consentTypeEnum = pgEnum("consent_type", [
  "parental",
  "age_confirmation",
  "liability",
  "media_authorization",
]);

export const mediaAuthScopeEnum = pgEnum("media_auth_scope", [
  "internal",
  "promotional",
  "public",
]);

export const consentStatusEnum = pgEnum("consent_status", [
  "granted",
  "revoked",
]);

// Versioned waiver content per organization. organizationId NULL = global
// default; orgs without their own waiver fall back to the most recent
// global one.
export const waivers = pgTable(
  "waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    type: waiverTypeEnum("type").notNull(),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    effectiveAt: timestamp("effective_at").defaultNow().notNull(),
    supersededAt: timestamp("superseded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("waivers_org_type_idx").on(table.organizationId, table.type),
    // At most one current (non-superseded) waiver per (org, type) at a time.
    // organizationId NULL → unique on type alone (the single global default).
    uniqueIndex("waivers_one_current_per_org_type")
      .on(table.organizationId, table.type)
      .where(sql`${table.supersededAt} IS NULL`),
  ],
);

// Append-only audit log: every consent grant or revocation. Active state is
// derived as "most recent row for (familyMemberId, type, scope) where
// status='granted' and (expiresAt IS NULL OR expiresAt > now())".
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    /** Waivers are per-organization legal releases (distinct legal entities —
     *  organizations.legalName). Nullable for legacy rows; the canonical
     *  validity predicate (src/lib/consents/liability.ts) requires an org
     *  match, so rows left NULL after backfill never satisfy it. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    registrationId: uuid("registration_id").references(() => registrations.id, {
      onDelete: "set null",
    }),
    waiverId: uuid("waiver_id").references(() => waivers.id, {
      onDelete: "restrict",
    }),
    type: consentTypeEnum("type").notNull(),
    // Only set when type='media_authorization'. NULL otherwise.
    scope: mediaAuthScopeEnum("scope"),
    status: consentStatusEnum("status").notNull().default("granted"),
    signedByUserId: uuid("signed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    signedByName: varchar("signed_by_name", { length: 200 }).notNull(),
    signedAt: timestamp("signed_at").defaultNow().notNull(),
    // For type='liability' this is signedAt + 365 days. NULL for parental,
    // age_confirmation, and media_authorization (they expire only on
    // revocation or waiver supersession).
    expiresAt: timestamp("expires_at"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    // sha256 of waiverId.content at signing time. Proves what was signed
    // even if the waiver row is later edited. NULL when waiverId is NULL.
    contentHash: varchar("content_hash", { length: 64 }),
    // Audit metadata for non-direct paths (walk-up admin proxy, etc.).
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("consents_family_member_idx").on(table.familyMemberId),
    index("consents_family_member_type_idx").on(table.familyMemberId, table.type),
    index("consents_registration_idx").on(table.registrationId),
    index("consents_waiver_idx").on(table.waiverId),
    index("consents_signed_at_idx").on(table.signedAt),
    index("consents_active_lookup_idx").on(
      table.familyMemberId,
      table.type,
      table.scope,
      table.status,
      table.signedAt,
    ),
    // Serves the annual-liability validity lookup: "is there a granted,
    // unexpired liability consent for this person at this org?"
    index("consents_liability_validity_idx")
      .on(table.familyMemberId, table.organizationId, table.expiresAt)
      .where(sql`${table.type} = 'liability'`),
  ],
);

export const waiversRelations = relations(waivers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [waivers.organizationId],
    references: [organizations.id],
  }),
  consents: many(consents),
}));

export const consentsRelations = relations(consents, ({ one }) => ({
  organization: one(organizations, {
    fields: [consents.organizationId],
    references: [organizations.id],
  }),
  familyMember: one(familyMembers, {
    fields: [consents.familyMemberId],
    references: [familyMembers.id],
  }),
  registration: one(registrations, {
    fields: [consents.registrationId],
    references: [registrations.id],
  }),
  waiver: one(waivers, {
    fields: [consents.waiverId],
    references: [waivers.id],
  }),
  signedBy: one(users, {
    fields: [consents.signedByUserId],
    references: [users.id],
  }),
}));

export type Waiver = typeof waivers.$inferSelect;
export type NewWaiver = typeof waivers.$inferInsert;
export type Consent = typeof consents.$inferSelect;
export type NewConsent = typeof consents.$inferInsert;

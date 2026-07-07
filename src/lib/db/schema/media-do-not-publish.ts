import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { familyMembers } from "./registrations";

/**
 * Media individual opt-out / do-not-publish (product-backlog build #3,
 * revised per owner decision 2026-07-07): *"Media consent is INDIVIDUAL.
 * Teams do not opt-out and can't opt-out."*
 *
 * This is a per-individual (family_member) flag — the operational record
 * behind takedown-on-request and the photographer "don't feature this
 * person" reference list. It governs that individual's FEATURED /
 * face-tagged media only. It is NOT a team-level gate — see
 * `checkSessionPublishConsent()` in `src/lib/consents/publish-check.ts`,
 * which folds this table's active rows into the face-tag path only. The
 * team-tag path is untouched: a team/wide session still publishes by
 * default regardless of any roster member's opt-out.
 *
 * `family_members` has no `organizationId` column directly — this table
 * denormalizes it at write time (resolved via
 * registrations -> seasons -> programs -> locations, the same chain
 * `requireSameOrgFamilyMember` uses) so tenant-scoped lookups don't need a
 * 4-way join on every read.
 *
 * At most one ACTIVE row per (organizationId, familyMemberId) — enforced by
 * the partial unique index below. Setting the flag again while one is
 * already active updates the existing row (see
 * `src/lib/consents/do-not-publish.ts`); clearing sets active=false and
 * stamps removedByUserId/removedAt rather than deleting the row, so the
 * takedown history is preserved.
 */
export const mediaDoNotPublish = pgTable(
  "media_do_not_publish",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    reason: text("reason"),
    active: boolean("active").default(true).notNull(),
    setByUserId: uuid("set_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    removedAt: timestamp("removed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // At most one active opt-out per (org, family_member) at a time.
    uniqueIndex("media_do_not_publish_one_active_per_org_fm")
      .on(t.organizationId, t.familyMemberId)
      .where(sql`${t.active}`),
    index("media_do_not_publish_org_idx").on(t.organizationId),
    index("media_do_not_publish_family_member_idx").on(t.familyMemberId),
  ],
);

export const mediaDoNotPublishRelations = relations(
  mediaDoNotPublish,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [mediaDoNotPublish.organizationId],
      references: [organizations.id],
    }),
    familyMember: one(familyMembers, {
      fields: [mediaDoNotPublish.familyMemberId],
      references: [familyMembers.id],
    }),
    setByUser: one(users, {
      fields: [mediaDoNotPublish.setByUserId],
      references: [users.id],
      relationName: "mediaDoNotPublishSetByUser",
    }),
    removedByUser: one(users, {
      fields: [mediaDoNotPublish.removedByUserId],
      references: [users.id],
      relationName: "mediaDoNotPublishRemovedByUser",
    }),
  }),
);

export type MediaDoNotPublish = typeof mediaDoNotPublish.$inferSelect;
export type NewMediaDoNotPublish = typeof mediaDoNotPublish.$inferInsert;

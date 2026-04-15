import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { familyMembers } from "./registrations";

// Join table linking family members (kids) to one or more parent users.
// Supports households where both parents (or guardians) want independent
// accounts, phones, and messaging preferences while sharing the same kids.
export const familyMemberParents = pgTable(
  "family_member_parents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    parentUserId: uuid("parent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 30 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    canReceiveMessages: boolean("can_receive_messages").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    familyIdx: index("idx_family_member_parents_family").on(
      table.familyMemberId,
    ),
    parentIdx: index("idx_family_member_parents_parent").on(table.parentUserId),
    uniqueLinkIdx: uniqueIndex("idx_family_member_parents_unique").on(
      table.familyMemberId,
      table.parentUserId,
    ),
  }),
);

export const familyMemberParentsRelations = relations(
  familyMemberParents,
  ({ one }) => ({
    familyMember: one(familyMembers, {
      fields: [familyMemberParents.familyMemberId],
      references: [familyMembers.id],
    }),
    parent: one(users, {
      fields: [familyMemberParents.parentUserId],
      references: [users.id],
    }),
  }),
);

export type FamilyMemberParent = typeof familyMemberParents.$inferSelect;
export type NewFamilyMemberParent = typeof familyMemberParents.$inferInsert;

export const FAMILY_MEMBER_PARENT_RELATIONSHIP = [
  "parent",
  "guardian",
  "grandparent",
  "other",
] as const;

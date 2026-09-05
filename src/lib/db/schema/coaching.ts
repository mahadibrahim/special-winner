import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Coach → classes Phase 0/1 staffing model (Task 1 of the
 * 2026-09-05-coach-classes-phase01 plan). `coaching_assignments` staffs a
 * coach onto a `kind`-discriminated target — a team, a class template, or a
 * single materialized class session. `targetId` is polymorphic by `kind`
 * and deliberately carries NO foreign key: the three target tables
 * (teams, class_slot_templates, drop_in_sessions) have no common parent to
 * FK against, and a FK per kind would require a CHECK to enforce only the
 * matching one is set — app-layer validated instead, same rationale as
 * coach_notes.activityId below.
 */
export const coachingRoleEnum = pgEnum("coaching_role", ["lead", "assistant"]);
export const coachingAssignmentKindEnum = pgEnum("coaching_assignment_kind", [
  "team",
  "class_template",
  "class_session",
]);

export const coachingAssignments = pgTable("coaching_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  coachUserId: uuid("coach_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: coachingRoleEnum("role").notNull().default("lead"),
  kind: coachingAssignmentKindEnum("kind").notNull(),
  targetId: uuid("target_id").notNull(), // polymorphic by kind — NO FK by design
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("coaching_assignments_coach_kind_target").on(t.coachUserId, t.kind, t.targetId),
  index("coaching_assignments_kind_target_idx").on(t.kind, t.targetId),
  index("coaching_assignments_coach_idx").on(t.coachUserId),
]);

export const coachingAssignmentsRelations = relations(coachingAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [coachingAssignments.organizationId],
    references: [organizations.id],
  }),
  coachUser: one(users, {
    fields: [coachingAssignments.coachUserId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [coachingAssignments.createdByUserId],
    references: [users.id],
  }),
}));

export type CoachingAssignment = typeof coachingAssignments.$inferSelect;
export type NewCoachingAssignment = typeof coachingAssignments.$inferInsert;

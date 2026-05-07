import { pgTable, pgEnum, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { games, venues } from "./teams";
import { users } from "./users";
import { mediaAssets } from "./media";

export const activityCompletionStatusEnum = pgEnum("activity_completion_status", [
  "pending",
  "in_progress",
  "overdue",
  "completed",
  "canceled",
  "skipped_by_handoff",
]);

export const activityCompletions = pgTable(
  "activity_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(), // 'act.<id>' catalog ref
    expectedAt: timestamp("expected_at", { withTimezone: true }).notNull(),
    status: activityCompletionStatusEnum("status").notNull().default("pending"),
    currentResponsibleRole: text("current_responsible_role").notNull(),
    responsibleHistory: jsonb("responsible_history").notNull().default([]), // [{role, assigned_at, reason}]
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    checklistSubmissionId: uuid("checklist_submission_id"),
    formSubmissionId: uuid("form_submission_id"),
    signatureSubmissionId: uuid("signature_submission_id"),
    photoId: uuid("photo_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    remindersFired: jsonb("reminders_fired").notNull().default([]), // [{stage, fired_at, channel, recipient_user_id, delivery_status, error?}]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("activity_completions_game_activity_unique").on(table.gameId, table.activityId),
    index("activity_completions_due_idx").on(table.organizationId, table.expectedAt),
    index("activity_completions_game_idx").on(table.gameId),
  ],
);

export const checklistSubmissions = pgTable("checklist_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id")
    .notNull()
    .references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  submittedByUserId: uuid("submitted_by_user_id")
    .notNull()
    .references(() => users.id),
  items: jsonb("items").notNull(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id")
    .notNull()
    .references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  submittedByUserId: uuid("submitted_by_user_id")
    .notNull()
    .references(() => users.id),
  fields: jsonb("fields").notNull(),
});

export const signatureSubmissions = pgTable("signature_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id")
    .notNull()
    .references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  signedByUserId: uuid("signed_by_user_id")
    .notNull()
    .references(() => users.id),
  typedName: text("typed_name").notNull(),
  signedRole: text("signed_role").notNull(),
});

export const venueRoleAssignments = pgTable(
  "venue_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull(), // 'role.<id>'
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }), // null = active
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("venue_role_active_idx")
      .on(table.venueId, table.roleId, table.userId)
      .where(sql`effective_to IS NULL`),
    index("venue_role_lookup_idx").on(table.venueId, table.roleId, table.effectiveFrom, table.effectiveTo),
  ],
);

// Relations
export const activityCompletionsRelations = relations(activityCompletions, ({ one }) => ({
  game: one(games, { fields: [activityCompletions.gameId], references: [games.id] }),
  organization: one(organizations, {
    fields: [activityCompletions.organizationId],
    references: [organizations.id],
  }),
  completedByUser: one(users, {
    fields: [activityCompletions.completedByUserId],
    references: [users.id],
  }),
}));

export const checklistSubmissionsRelations = relations(checklistSubmissions, ({ one }) => ({
  completion: one(activityCompletions, {
    fields: [checklistSubmissions.completionId],
    references: [activityCompletions.id],
  }),
  submittedByUser: one(users, {
    fields: [checklistSubmissions.submittedByUserId],
    references: [users.id],
  }),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  completion: one(activityCompletions, {
    fields: [formSubmissions.completionId],
    references: [activityCompletions.id],
  }),
  submittedByUser: one(users, {
    fields: [formSubmissions.submittedByUserId],
    references: [users.id],
  }),
}));

export const signatureSubmissionsRelations = relations(signatureSubmissions, ({ one }) => ({
  completion: one(activityCompletions, {
    fields: [signatureSubmissions.completionId],
    references: [activityCompletions.id],
  }),
  signedByUser: one(users, {
    fields: [signatureSubmissions.signedByUserId],
    references: [users.id],
  }),
}));

export const venueRoleAssignmentsRelations = relations(venueRoleAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [venueRoleAssignments.organizationId],
    references: [organizations.id],
  }),
  venue: one(venues, {
    fields: [venueRoleAssignments.venueId],
    references: [venues.id],
  }),
  user: one(users, {
    fields: [venueRoleAssignments.userId],
    references: [users.id],
  }),
}));

export type ActivityCompletion = typeof activityCompletions.$inferSelect;
export type NewActivityCompletion = typeof activityCompletions.$inferInsert;
export type ChecklistSubmission = typeof checklistSubmissions.$inferSelect;
export type NewChecklistSubmission = typeof checklistSubmissions.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type SignatureSubmission = typeof signatureSubmissions.$inferSelect;
export type NewSignatureSubmission = typeof signatureSubmissions.$inferInsert;
export type VenueRoleAssignment = typeof venueRoleAssignments.$inferSelect;
export type NewVenueRoleAssignment = typeof venueRoleAssignments.$inferInsert;

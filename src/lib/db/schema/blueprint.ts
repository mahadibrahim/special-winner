import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { curriculumSequences, curriculumSequenceEntries } from "./curriculum-sequences";
import { practiceTemplates } from "./practice-planning";
import { seasons } from "./programs";
import { users } from "./users";

// One row per distribution event: an admin/director pushes a
// curriculum sequence onto a season's groups. Anchors lineage for
// prescribed session_plans (session_plans.sequence_attachment_id),
// re-distribution, and audit ("who distributed this, when").
export const sequenceAttachments = pgTable(
  "sequence_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => curriculumSequences.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    // Audit "who did this" column — notNull, no onDelete override (default
    // no action), same precedent as session_plans.coachUserId's sibling
    // audit columns in activity-tracking.ts (submittedByUserId etc).
    distributedBy: uuid("distributed_by")
      .notNull()
      .references(() => users.id),
    distributedAt: timestamp("distributed_at").defaultNow().notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("sequence_attachments_season_idx").on(table.seasonId),
    index("sequence_attachments_sequence_idx").on(table.sequenceId),
  ],
);

// Records a director consciously dismissing a stage-skew (warn-tier)
// guardrail badge. Never written for block-tier safety violations — those
// cannot be dismissed.
//
// --- Keyed by (sequenceId, templateId), not sequenceEntryId (Task 7) ---
// A sequence entry row is ephemeral: the entries PUT (entries.ts)
// delete-reinserts ALL entries with fresh UUIDs on every save, so a
// dismissal keyed to `sequence_entry_id` alone would silently vanish the
// next time the director reorders or re-saves the arc — the exact bug
// this redesign fixes. A dismissal is really an act on "this template's
// stage skew, for this sequence" and must survive reorders/re-adds
// permanently. `sequenceEntryId` is kept as nullable, optional
// provenance (best-effort "which specific entry-write prompted this"),
// not the identity the row is looked up by; all lookups/writes go
// through (sequenceId, templateId).
export const blueprintWarningDismissals = pgTable(
  "blueprint_warning_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceEntryId: uuid("sequence_entry_id").references(
      () => curriculumSequenceEntries.id,
      { onDelete: "cascade" },
    ),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => curriculumSequences.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => practiceTemplates.id, { onDelete: "cascade" }),
    dismissedBy: uuid("dismissed_by")
      .notNull()
      .references(() => users.id),
    dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
    reason: text("reason"),
  },
  (table) => [
    index("blueprint_warning_dismissals_entry_idx").on(table.sequenceEntryId),
    index("blueprint_warning_dismissals_sequence_template_idx").on(
      table.sequenceId,
      table.templateId,
    ),
  ],
);

// Relations
export const sequenceAttachmentsRelations = relations(
  sequenceAttachments,
  ({ one }) => ({
    sequence: one(curriculumSequences, {
      fields: [sequenceAttachments.sequenceId],
      references: [curriculumSequences.id],
    }),
    season: one(seasons, {
      fields: [sequenceAttachments.seasonId],
      references: [seasons.id],
    }),
    distributedByUser: one(users, {
      fields: [sequenceAttachments.distributedBy],
      references: [users.id],
    }),
  }),
);

export const blueprintWarningDismissalsRelations = relations(
  blueprintWarningDismissals,
  ({ one }) => ({
    sequenceEntry: one(curriculumSequenceEntries, {
      fields: [blueprintWarningDismissals.sequenceEntryId],
      references: [curriculumSequenceEntries.id],
    }),
    sequence: one(curriculumSequences, {
      fields: [blueprintWarningDismissals.sequenceId],
      references: [curriculumSequences.id],
    }),
    template: one(practiceTemplates, {
      fields: [blueprintWarningDismissals.templateId],
      references: [practiceTemplates.id],
    }),
    dismissedByUser: one(users, {
      fields: [blueprintWarningDismissals.dismissedBy],
      references: [users.id],
    }),
  }),
);

// Type exports
export type SequenceAttachment = typeof sequenceAttachments.$inferSelect;
export type NewSequenceAttachment = typeof sequenceAttachments.$inferInsert;
export type BlueprintWarningDismissal =
  typeof blueprintWarningDismissals.$inferSelect;
export type NewBlueprintWarningDismissal =
  typeof blueprintWarningDismissals.$inferInsert;

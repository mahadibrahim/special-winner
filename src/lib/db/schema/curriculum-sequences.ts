import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { sports } from "./sports";
import { developmentStages } from "./curriculum";
import { practiceTemplates } from "./practice-planning";

// Which delivery format a sequence is authored for. Deliberately a NEW enum
// (not the existing `program_type` on programs) — that one has no 'class'
// value and carries 'tournament'/'training' which make no sense here.
export const curriculumProgramTypeEnum = pgEnum("curriculum_program_type", [
  "league",
  "class",
  "camp",
  "clinic",
]);

// An ordered season-long arc of practice templates ("Week 1: dribbling,
// Week 2: passing, …"). null organizationId = global default, org rows
// override — same convention as practice_templates.
export const curriculumSequences = pgTable(
  "curriculum_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }), // null = global sequence
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    developmentStageId: uuid("development_stage_id")
      .notNull()
      .references(() => developmentStages.id, { onDelete: "restrict" }),
    programType: curriculumProgramTypeEnum("program_type")
      .default("league")
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the idempotent curriculum loader (Task 9), mirroring
    // practice_templates_sport_name_uniq.
    uniqueIndex("curriculum_sequences_sport_name_uniq").on(
      table.sportId,
      table.name,
    ),
    index("curriculum_sequences_org_idx").on(table.organizationId),
  ],
);

export const curriculumSequenceEntries = pgTable(
  "curriculum_sequence_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => curriculumSequences.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 1..N — entry N maps to the Nth practice date
    // restrict (not cascade): deleting a template that a sequence still uses
    // must fail loudly; the admin removes it from the sequence first. The
    // templates DELETE endpoint maps the 23503 to a friendly 400 (Task 5).
    templateId: uuid("template_id")
      .notNull()
      .references(() => practiceTemplates.id, { onDelete: "restrict" }),
    objectives: jsonb("objectives").$type<string[]>(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("curriculum_sequence_entries_seq_position_uniq").on(
      table.sequenceId,
      table.position,
    ),
  ],
);

// Relations
export const curriculumSequencesRelations = relations(
  curriculumSequences,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [curriculumSequences.organizationId],
      references: [organizations.id],
    }),
    sport: one(sports, {
      fields: [curriculumSequences.sportId],
      references: [sports.id],
    }),
    stage: one(developmentStages, {
      fields: [curriculumSequences.developmentStageId],
      references: [developmentStages.id],
    }),
    entries: many(curriculumSequenceEntries),
  }),
);

export const curriculumSequenceEntriesRelations = relations(
  curriculumSequenceEntries,
  ({ one }) => ({
    sequence: one(curriculumSequences, {
      fields: [curriculumSequenceEntries.sequenceId],
      references: [curriculumSequences.id],
    }),
    template: one(practiceTemplates, {
      fields: [curriculumSequenceEntries.templateId],
      references: [practiceTemplates.id],
    }),
  }),
);

// Type exports
export type CurriculumSequence = typeof curriculumSequences.$inferSelect;
export type NewCurriculumSequence = typeof curriculumSequences.$inferInsert;
export type CurriculumSequenceEntry =
  typeof curriculumSequenceEntries.$inferSelect;
export type NewCurriculumSequenceEntry =
  typeof curriculumSequenceEntries.$inferInsert;

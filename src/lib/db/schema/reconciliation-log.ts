import { pgTable, uuid, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { teamGroups } from "./team-groups"

export const reconciliationLog = pgTable(
  "reconciliation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    teamGroupId: uuid("team_group_id")
      .notNull()
      .references(() => teamGroups.id, { onDelete: "cascade" }),
    driftDetected: jsonb("drift_detected")
      .$type<{ added: string[]; removed: string[] }>()
      .notNull()
      .default({ added: [], removed: [] }),
    fixesApplied: jsonb("fixes_applied")
      .$type<{ invited: string[]; removed: string[] }>()
      .notNull()
      .default({ invited: [], removed: [] }),
    errors: jsonb("errors").$type<Record<string, unknown>[]>().notNull().default([]),
  },
  (t) => ({
    teamGroupIdx: index("reconciliation_log_team_group_idx").on(t.teamGroupId),
    ranAtIdx: index("reconciliation_log_ran_at_idx").on(t.ranAt),
  }),
)

export const reconciliationLogRelations = relations(reconciliationLog, ({ one }) => ({
  teamGroup: one(teamGroups, {
    fields: [reconciliationLog.teamGroupId],
    references: [teamGroups.id],
  }),
}))

export type ReconciliationLog = typeof reconciliationLog.$inferSelect
export type NewReconciliationLog = typeof reconciliationLog.$inferInsert

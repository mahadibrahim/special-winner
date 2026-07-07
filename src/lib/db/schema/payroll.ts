import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Audit trail for manual Gusto payroll CSV exports (product-backlog build
 * #6). This is NOT a live Gusto API integration — an admin downloads a CSV
 * here and hand-uploads it into Gusto's Smart Import. Every successful
 * download writes one row here (including header-only/empty exports) so
 * there's a record of who pulled payroll data for which period.
 *
 * `kind` distinguishes the two CSV flavors: `hours` (hourly W-2 labor —
 * coach/venue_manager time_entries summed) and `referee_fees` (per-match
 * 1099 stipends from game_officials.feeCents). `periodStart`/`periodEnd`
 * store the resolved UTC bounds (see resolvePayPeriodBoundsUtc), not the
 * raw YYYY-MM-DD query params, so the audit row is unambiguous regardless
 * of the org's timezone.
 */
export const payrollExportKindEnum = pgEnum("payroll_export_kind", [
  "hours",
  "referee_fees",
]);

export const payrollExports = pgTable(
  "payroll_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: payrollExportKindEnum("kind").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    rowCount: integer("row_count").notNull().default(0),
    exportedByUserId: uuid("exported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("payroll_exports_org_idx").on(table.organizationId),
    index("payroll_exports_exported_by_idx").on(table.exportedByUserId),
  ],
);

export const payrollExportsRelations = relations(payrollExports, ({ one }) => ({
  organization: one(organizations, {
    fields: [payrollExports.organizationId],
    references: [organizations.id],
  }),
  exportedBy: one(users, {
    fields: [payrollExports.exportedByUserId],
    references: [users.id],
  }),
}));

export type PayrollExport = typeof payrollExports.$inferSelect;
export type NewPayrollExport = typeof payrollExports.$inferInsert;
export type PayrollExportKind = (typeof payrollExportKindEnum.enumValues)[number];

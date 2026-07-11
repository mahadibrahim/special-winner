import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sessionPlans } from "./practice-planning";
import { rosters } from "./teams";
import { skills } from "./curriculum";

export const captureKindEnum = pgEnum("capture_kind", ["glow", "observation"]);

// Field-mode quick-capture inbox (coach session lifecycle spec). Rows are
// seeds for the wrap-up flow, not parent-visible content — promotion into
// coach_notes happens in wrap-up, which stamps consumedAt.
export const sessionCaptures = pgTable(
  "session_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionPlanId: uuid("session_plan_id")
      .notNull()
      .references(() => sessionPlans.id, { onDelete: "cascade" }),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rosters.id, { onDelete: "cascade" }),
    kind: captureKindEnum("kind").notNull(),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    note: text("note"),
    // Client-generated idempotency key: offline flush retries must never
    // double-insert. Unique per session, not globally — two sessions may
    // coincidentally generate the same client id.
    clientId: text("client_id").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("session_captures_session_client_uniq").on(
      table.sessionPlanId,
      table.clientId,
    ),
    index("session_captures_session_idx").on(table.sessionPlanId),
  ],
);

export const sessionCapturesRelations = relations(sessionCaptures, ({ one }) => ({
  sessionPlan: one(sessionPlans, {
    fields: [sessionCaptures.sessionPlanId],
    references: [sessionPlans.id],
  }),
  roster: one(rosters, {
    fields: [sessionCaptures.rosterId],
    references: [rosters.id],
  }),
}));

export type SessionCapture = typeof sessionCaptures.$inferSelect;
export type NewSessionCapture = typeof sessionCaptures.$inferInsert;

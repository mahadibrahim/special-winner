import { pgTable, uuid, timestamp, varchar, integer, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { users } from "./users"

export const userNudgeState = pgTable(
  "user_nudge_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nudgeKey: varchar("nudge_key", { length: 50 }).notNull(),
    lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
    lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }),
    dismissalCount: integer("dismissal_count").notNull().default(0),
    tappedAt: timestamp("tapped_at", { withTimezone: true }),
  },
  (t) => ({
    userNudgeUnique: uniqueIndex("user_nudge_state_user_key_unique").on(t.userId, t.nudgeKey),
    userIdx: index("user_nudge_state_user_idx").on(t.userId),
  }),
)

export const userNudgeStateRelations = relations(userNudgeState, ({ one }) => ({
  user: one(users, { fields: [userNudgeState.userId], references: [users.id] }),
}))

export type UserNudgeState = typeof userNudgeState.$inferSelect
export type NewUserNudgeState = typeof userNudgeState.$inferInsert

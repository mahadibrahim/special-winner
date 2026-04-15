import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { conversations } from "./conversations";

/**
 * Staff notification log — tracks every time the system notified a staff
 * member (out-of-band SMS/email, in-app badge, etc.) about an inbound
 * conversation message.
 *
 * Used for two things:
 *  1. Throttling — we don't want to ping the same coach 20 times in 5 minutes
 *     when a parent sends a burst of messages
 *  2. Audit — staff can see when they were notified and via which channel,
 *     useful for diagnosing "I didn't know about that" complaints
 *
 * Intentionally small. Each row is `(staff_user_id, conversation_id,
 * notification_type, sent_at)`. Throttling logic queries by
 * `(staff_user_id, sent_at >= now() - 5 minutes)` to decide whether to
 * send another notification or aggregate.
 */
export const staffNotificationLog = pgTable(
  "staff_notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    notificationType: varchar("notification_type", { length: 30 }).notNull(),
    deliveredChannel: varchar("delivered_channel", { length: 20 }),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (table) => ({
    staffRecentIdx: index("idx_staff_notification_staff_recent").on(
      table.staffUserId,
      table.sentAt,
    ),
    conversationIdx: index("idx_staff_notification_conversation").on(
      table.conversationId,
    ),
  }),
);

export const staffNotificationLogRelations = relations(
  staffNotificationLog,
  ({ one }) => ({
    staff: one(users, {
      fields: [staffNotificationLog.staffUserId],
      references: [users.id],
    }),
    conversation: one(conversations, {
      fields: [staffNotificationLog.conversationId],
      references: [conversations.id],
    }),
  }),
);

export type StaffNotificationLog = typeof staffNotificationLog.$inferSelect;
export type NewStaffNotificationLog =
  typeof staffNotificationLog.$inferInsert;

export const STAFF_NOTIFICATION_TYPE = [
  "new_inbound_message",
  "conversation_assigned",
  "payment_question",
  "urgent_escalation",
] as const;

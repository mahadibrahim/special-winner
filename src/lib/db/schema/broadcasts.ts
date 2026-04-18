import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { teams } from "./teams"
import { users } from "./users"

export const broadcastLog = pgTable(
  "broadcast_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    initiatorId: uuid("initiator_id").references(() => users.id, { onDelete: "set null" }),
    initiatorType: varchar("initiator_type", { length: 20 }).notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    teamIds: jsonb("team_ids").$type<string[]>().notNull().default([]),
    messageType: varchar("message_type", { length: 50 }).notNull(),
    body: text("body").notNull(),
    isUrgent: boolean("is_urgent").notNull().default(false),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    channelsUsed: jsonb("channels_used").$type<Record<string, unknown>>().notNull().default({}),
    deliverySummary: jsonb("delivery_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    nonce: varchar("nonce", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("broadcast_log_org_idx").on(t.organizationId),
    initiatorIdx: index("broadcast_log_initiator_idx").on(t.initiatorId),
    nonceIdx: index("broadcast_log_nonce_idx").on(t.nonce),
    sentAtIdx: index("broadcast_log_sent_at_idx").on(t.sentAt),
  }),
)

export const scheduledBroadcasts = pgTable(
  "scheduled_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    initiatorId: uuid("initiator_id").references(() => users.id, { onDelete: "set null" }),
    messageType: varchar("message_type", { length: 50 }).notNull(),
    body: text("body").notNull(),
    isUrgent: boolean("is_urgent").notNull().default(false),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    cancelIf: jsonb("cancel_if").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    firedAt: timestamp("fired_at", { withTimezone: true }),
    resultingBroadcastId: uuid("resulting_broadcast_id").references(() => broadcastLog.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("scheduled_broadcasts_org_idx").on(t.organizationId),
    teamIdx: index("scheduled_broadcasts_team_idx").on(t.teamId),
    statusIdx: index("scheduled_broadcasts_status_idx").on(t.status),
    scheduledForIdx: index("scheduled_broadcasts_scheduled_for_idx").on(t.scheduledFor),
  }),
)

export const broadcastLogRelations = relations(broadcastLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [broadcastLog.organizationId],
    references: [organizations.id],
  }),
  initiator: one(users, { fields: [broadcastLog.initiatorId], references: [users.id] }),
}))

export const scheduledBroadcastsRelations = relations(scheduledBroadcasts, ({ one }) => ({
  organization: one(organizations, {
    fields: [scheduledBroadcasts.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, { fields: [scheduledBroadcasts.teamId], references: [teams.id] }),
  initiator: one(users, { fields: [scheduledBroadcasts.initiatorId], references: [users.id] }),
  resultingBroadcast: one(broadcastLog, {
    fields: [scheduledBroadcasts.resultingBroadcastId],
    references: [broadcastLog.id],
  }),
}))

export type BroadcastLog = typeof broadcastLog.$inferSelect
export type NewBroadcastLog = typeof broadcastLog.$inferInsert
export type ScheduledBroadcast = typeof scheduledBroadcasts.$inferSelect
export type NewScheduledBroadcast = typeof scheduledBroadcasts.$inferInsert

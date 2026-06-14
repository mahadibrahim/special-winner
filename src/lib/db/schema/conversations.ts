import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

// Conversations — threads between a parent and the organization
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    parentUserId: uuid("parent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    assignedStaffId: uuid("assigned_staff_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignmentRole: varchar("assignment_role", { length: 20 }),
    pendingConfirmation: jsonb("pending_confirmation"),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    subjectContext: jsonb("subject_context"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgParentIdx: index("idx_conversations_org_parent").on(
      table.organizationId,
      table.parentUserId,
    ),
    assignmentIdx: index("idx_conversations_assignment").on(
      table.organizationId,
      table.assignmentRole,
      table.assignedStaffId,
    ),
    lastMessageIdx: index("idx_conversations_last_message").on(
      table.organizationId,
      table.lastMessageAt,
    ),
  }),
);

// Individual messages within a conversation
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 10 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    senderType: varchar("sender_type", { length: 20 }).notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    externalMessageId: varchar("external_message_id", { length: 255 }),
    body: text("body").notNull(),
    bodyHtml: text("body_html"),
    attachments: jsonb("attachments"),
    intentClassification: jsonb("intent_classification"),
    botActionResult: jsonb("bot_action_result"),
    deliveredAt: timestamp("delivered_at"),
    failedAt: timestamp("failed_at"),
    failureReason: text("failure_reason"),
    // FKs for teamGroupId and broadcastId are added manually in the migration (no .references() here to avoid circular imports)
    teamGroupId: uuid("team_group_id"),
    broadcastId: uuid("broadcast_id"),
    targetType: varchar("target_type", { length: 20 }).notNull().default("user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("idx_conversation_messages_conversation").on(
      table.conversationId,
      table.createdAt,
    ),
    orgIdx: index("idx_conversation_messages_org").on(
      table.organizationId,
      table.createdAt,
    ),
    externalIdx: index("idx_conversation_messages_external").on(
      table.externalMessageId,
    ),
  }),
);

// Audit trail of every action the bot took on behalf of a parent
export const botActionsLog = pgTable("bot_actions_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  triggeredByMessageId: uuid("triggered_by_message_id").references(
    () => conversationMessages.id,
    { onDelete: "set null" },
  ),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  actionParams: jsonb("action_params"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  reversible: boolean("reversible").notNull().default(true),
  reversedAt: timestamp("reversed_at"),
  reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [conversations.organizationId],
      references: [organizations.id],
    }),
    parent: one(users, {
      fields: [conversations.parentUserId],
      references: [users.id],
      relationName: "conversation_parent",
    }),
    assignedStaff: one(users, {
      fields: [conversations.assignedStaffId],
      references: [users.id],
      relationName: "conversation_assignee",
    }),
    messages: many(conversationMessages),
    botActions: many(botActionsLog),
  }),
);

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversationId],
      references: [conversations.id],
    }),
    sender: one(users, {
      fields: [conversationMessages.senderUserId],
      references: [users.id],
    }),
  }),
);

export const botActionsLogRelations = relations(botActionsLog, ({ one }) => ({
  conversation: one(conversations, {
    fields: [botActionsLog.conversationId],
    references: [conversations.id],
  }),
  triggeredByMessage: one(conversationMessages, {
    fields: [botActionsLog.triggeredByMessageId],
    references: [conversationMessages.id],
  }),
  reversedBy: one(users, {
    fields: [botActionsLog.reversedByUserId],
    references: [users.id],
  }),
}));

// Type exports
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
export type BotActionLog = typeof botActionsLog.$inferSelect;
export type NewBotActionLog = typeof botActionsLog.$inferInsert;

// Valid values (kept as const arrays rather than pgEnum to allow cheap additions)
export const CONVERSATION_STATUS = ["active", "archived", "muted"] as const;
export const MESSAGE_DIRECTION = ["inbound", "outbound"] as const;
export const MESSAGE_CHANNEL = ["sms", "email", "telegram", "whatsapp", "web"] as const;
export const MESSAGE_SENDER_TYPE = [
  "parent",
  "bot",
  "coach",
  "admin",
  "system",
] as const;
export const ASSIGNMENT_ROLE = ["bot", "coach", "admin"] as const;

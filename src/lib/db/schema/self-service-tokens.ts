import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";

// === enums ===

export const selfServiceTokenKindEnum = pgEnum("self_service_token_kind", [
  "drop_in_booking",
  "field_rental",
  "roster_entry",
  "walkin_session",
]);

export const selfServiceSendChannelEnum = pgEnum("self_service_send_channel", [
  "email",
  "sms",
  "qr",
  "kiosk_search",
  "customer_dashboard",
]);

// === tables ===

export const selfServiceTokens = pgTable(
  "self_service_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    kind: selfServiceTokenKindEnum("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    sentVia: selfServiceSendChannelEnum("sent_via").notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByIp: text("consumed_by_ip"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("self_service_tokens_token_idx").on(table.token),
    index("self_service_tokens_target_idx").on(table.targetId, table.kind),
    index("self_service_tokens_expires_unclaimed_idx")
      .on(table.expiresAt)
      .where(sql`consumed_at IS NULL`),
  ],
);

// Type exports
export type SelfServiceToken = typeof selfServiceTokens.$inferSelect;
export type NewSelfServiceToken = typeof selfServiceTokens.$inferInsert;

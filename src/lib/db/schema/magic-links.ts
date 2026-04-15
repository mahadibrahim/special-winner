import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

// Magic links — generalized single-use signed tokens bound to a specific action
export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    purpose: varchar("purpose", { length: 50 }).notNull(),
    purposeContext: jsonb("purpose_context"),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    deliveredChannel: varchar("delivered_channel", { length: 20 }),
    deliveredTo: varchar("delivered_to", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index("idx_magic_links_token_hash").on(table.tokenHash),
    userPurposeIdx: index("idx_magic_links_user_purpose").on(
      table.userId,
      table.purpose,
      table.expiresAt,
    ),
  }),
);

export const magicLinksRelations = relations(magicLinks, ({ one }) => ({
  user: one(users, {
    fields: [magicLinks.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [magicLinks.organizationId],
    references: [organizations.id],
  }),
}));

export type MagicLink = typeof magicLinks.$inferSelect;
export type NewMagicLink = typeof magicLinks.$inferInsert;

// Supported magic-link purposes.
// Each purpose has its own default expiration and downstream handler (see src/lib/auth/magic-link.ts).
export const MAGIC_LINK_PURPOSE = [
  "login",
  "pay_invoice",
  "view_development_report",
  "register_for_season",
  "update_medical_info",
  "update_phone",
  "view_season_summary",
  "password_reset_login",
  "telegram_bind",
] as const;

export type MagicLinkPurpose = (typeof MAGIC_LINK_PURPOSE)[number];

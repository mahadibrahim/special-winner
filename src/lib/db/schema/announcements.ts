import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

// Enums
export const announcementTargetEnum = pgEnum("announcement_target", [
  "all",
  "parents",
  "coaches",
  "program",
  "team",
]);

export const announcementStatusEnum = pgEnum("announcement_status", [
  "draft",
  "published",
  "archived",
]);

// Announcements table
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  target: announcementTargetEnum("target").default("all").notNull(),
  targetId: uuid("target_id"), // For program or team specific announcements
  status: announcementStatusEnum("status").default("draft").notNull(),
  sendEmail: boolean("send_email").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const announcementsRelations = relations(announcements, ({ one }) => ({
  organization: one(organizations, {
    fields: [announcements.organizationId],
    references: [organizations.id],
  }),
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
}));

// Type exports
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roleNameEnum = pgEnum("role_name", [
  "super_admin",
  "location_admin",
  "coach",
  "parent",
  "player",
  "media_staff",
  "media_editor",
]);

export const scopeTypeEnum = pgEnum("scope_type", [
  "global",
  "organization",
  "location",
  "program",
  "team",
]);

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  avatarUrl: text("avatar_url"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  messagingPrimaryChannel: varchar("messaging_primary_channel", { length: 20 }),
  messagingFallbackChannel: varchar("messaging_fallback_channel", { length: 20 }),
  telegramChatId: varchar("telegram_chat_id", { length: 100 }),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  alsoEmailCopy: boolean("also_email_copy").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sessions table (for Lucia Auth)
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

// Roles table
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: roleNameEnum("name").unique().notNull(),
  description: text("description"),
  permissions: text("permissions").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User roles (assignments)
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scopeType: scopeTypeEnum("scope_type").default("global").notNull(),
    scopeId: uuid("scope_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    index("user_roles_user_idx").on(table.userId),
    index("user_roles_role_scope_idx").on(
      table.roleId,
      table.scopeType,
      table.scopeId,
    ),
  ],
);

// Email verification tokens
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_verification_tokens_user_idx").on(table.userId),
  ],
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  userRoles: many(userRoles),
  emailVerificationTokens: many(emailVerificationTokens),
  // Organization access is defined in organizations.ts to avoid circular imports
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;

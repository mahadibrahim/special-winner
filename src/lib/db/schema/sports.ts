import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  date,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

// Sports table (admin configurable)
export const sports = pgTable("sports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull(),
  icon: varchar("icon", { length: 50 }), // emoji or icon name
  color: varchar("color", { length: 20 }), // hex color
  settings: jsonb("settings"), // sport-specific settings
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueOrgSlug: unique().on(table.organizationId, table.slug),
}));

// Age groups (reusable across sports)
export const ageGroups = pgTable("age_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 50 }).notNull(), // 'U6', 'U8', etc.
  minAge: integer("min_age").notNull(),
  maxAge: integer("max_age").notNull(),
  birthDateCutoff: date("birth_date_cutoff"), // For age verification
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const sportsRelations = relations(sports, ({ one }) => ({
  organization: one(organizations, {
    fields: [sports.organizationId],
    references: [organizations.id],
  }),
}));

export const ageGroupsRelations = relations(ageGroups, ({ one }) => ({
  organization: one(organizations, {
    fields: [ageGroups.organizationId],
    references: [organizations.id],
  }),
}));

// Type exports
export type Sport = typeof sports.$inferSelect;
export type NewSport = typeof sports.$inferInsert;
export type AgeGroup = typeof ageGroups.$inferSelect;
export type NewAgeGroup = typeof ageGroups.$inferInsert;

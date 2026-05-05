import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { organizations, locations } from "./organizations";

/**
 * Standalone events — separate from league `seasons`. Used for top-of-funnel
 * social/marketing hooks: tournaments, watch parties, clinics, open houses.
 *
 * Each event has its own registration target (URL or future internal flow).
 */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // 'tournament' | 'watch_party' | 'clinic' | 'open_house' | etc
  audience: varchar("audience", { length: 20 }), // 'youth' | 'adult' | 'all'

  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  venueLabel: varchar("venue_label", { length: 255 }), // free-text display venue when locationId is unset

  registrationUrl: text("registration_url"), // external CTA target; null if internal flow lands later
  priceCents: integer("price_cents"),
  capacity: integer("capacity"),

  active: boolean("active").default(true).notNull(),
  featured: boolean("featured").default(false).notNull(),
  imageUrl: text("image_url"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

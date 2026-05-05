import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations, locations } from "./organizations";

/**
 * Partner venues (typically bars/restaurants) that offer Aspire-player
 * discounts on league nights. Sponsorship adds a community flywheel:
 * post-game social drives bar traffic; bar gets recognition on the
 * Aspire site.
 */
export const sponsorBars = pgTable("sponsor_bars", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  addressLine1: varchar("address_line1", { length: 255 }),
  url: text("url"), // bar's own website
  description: text("description"),
  perk: text("perk"), // e.g. "$2 off pints when you show your Aspire roster"

  active: boolean("active").default(true).notNull(),
  featured: boolean("featured").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SponsorBar = typeof sponsorBars.$inferSelect;
export type NewSponsorBar = typeof sponsorBars.$inferInsert;

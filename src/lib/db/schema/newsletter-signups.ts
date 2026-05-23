import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Top-of-funnel email capture for visitors not yet ready to register.
 * Captured from the public footer form. Audience + location are optional
 * but help segment broadcast emails.
 *
 * Email is unique — re-submissions update the row in the API layer rather
 * than creating duplicates.
 */
export const newsletterSignups = pgTable(
  "newsletter_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NEW: tenant the signup belongs to. Nullable so historical rows
    // (predating Phase 0) keep working; new rows always carry it.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    audience: varchar("audience", { length: 20 }), // 'parent' | 'adult' | null
    locationInterest: varchar("location_interest", { length: 100 }),
    source: varchar("source", { length: 50 }), // e.g. 'footer' | 'sport-page'
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueEmail: unique().on(table.email),
  }),
);

export type NewsletterSignup = typeof newsletterSignups.$inferSelect;
export type NewNewsletterSignup = typeof newsletterSignups.$inferInsert;

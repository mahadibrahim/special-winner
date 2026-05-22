import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * B2B sales lead capture for corporate-team registrations. Companies that
 * want to sponsor multiple teams (intramural-style league as an employee
 * benefit) fill out the /corporate form; admin works the lead manually for v1.
 *
 * Status moves: new → contacted → qualified → won | lost | dormant.
 */
export const corporateInquiries = pgTable("corporate_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  // NEW: tenant the inquiry belongs to. Nullable so historical rows
  // (predating Phase 0) keep working; new rows always carry it.
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),

  companyName: varchar("company_name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 200 }).notNull(),
  contactEmail: varchar("contact_email", { length: 320 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 30 }),
  companySize: varchar("company_size", { length: 50 }), // '1-10' | '11-50' | '51-200' | '200+'
  estimatedTeams: integer("estimated_teams"),
  sportInterest: varchar("sport_interest", { length: 100 }),
  preferredLocation: varchar("preferred_location", { length: 100 }),
  preferredStart: varchar("preferred_start", { length: 100 }), // free-text season hint
  notes: text("notes"),

  status: varchar("status", { length: 30 }).default("new").notNull(),
  internalNotes: text("internal_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CorporateInquiry = typeof corporateInquiries.$inferSelect;
export type NewCorporateInquiry = typeof corporateInquiries.$inferInsert;

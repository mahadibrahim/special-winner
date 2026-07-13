import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Coach/ref/staff job applications (the site-side half of the Notion ATS).
 * This table is the source of truth; Notion is a synced pipeline view —
 * see docs/superpowers/specs/2026-07-04-hiring-pipeline-ats-design.md.
 *
 * `status` exists only for the admin fallback list (new → archived);
 * hiring stages live in Notion and are never synced back — EXCEPT the
 * terminal `hired` value, stamped by POST /api/admin/applications/[id]/hire
 * together with `hiredUserId` (the created/linked coach account).
 */
export const jobApplicationRoleEnum = pgEnum("job_application_role", [
  "referee",
  "coach",
  "staff",
  "host",
]);

export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  brand: varchar("brand", { length: 30 }).default("aspire").notNull(),

  role: jobApplicationRoleEnum("role").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  preferredLocation: varchar("preferred_location", { length: 30 }), // worthington | downtown | either
  certifications: text("certifications"),
  experience: text("experience").notNull(),
  availability: text("availability").array().default([]).notNull(), // weeknights | weekends | mornings
  resumeKey: text("resume_key"), // R2 object key, not a URL (signed URLs expire)
  // --- Host-application-only fields (null for other roles) ---------------
  // Bio lives in `experience` (the form labels it "Bio" for hosts).
  dateOfBirth: varchar("date_of_birth", { length: 10 }), // YYYY-MM-DD
  gamesPlayed: varchar("games_played", { length: 10 }), // 0 | 1-3 | 3-5 | 5+
  weeklyCommitment: boolean("weekly_commitment"),
  photoKey: text("photo_key"), // R2 keys under careers/hosts/
  motivationVideoKey: text("motivation_video_key"),
  demoVideoKey: text("demo_video_key"),
  source: varchar("source", { length: 200 }),

  status: varchar("status", { length: 30 }).default("new").notNull(), // new | archived | hired
  hiredUserId: uuid("hired_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  notionPageId: varchar("notion_page_id", { length: 64 }),
  notionSyncedAt: timestamp("notion_synced_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;

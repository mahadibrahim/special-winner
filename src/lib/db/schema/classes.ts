import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  time,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { familyMembers } from "./registrations";
import { memberships } from "./memberships";

export const classEnrollmentStatusEnum = pgEnum("class_enrollment_status", [
  "active",
  "ended",
]);

/**
 * A recurring weekly class slot ("Soccer Skills 6–8, Tue 17:00, cap 12").
 * The cron materializes one drop_in_sessions row (kind='class') per active
 * template per week; enrolled children are auto-booked into it while their
 * monthly class allotment lasts.
 *
 * References venues (not locations): the cron inserts a drop_in_sessions row
 * per materialization, and dropInSessions.venueId is NOT NULL — a location
 * does not deterministically resolve to a venue (venues.locationId is a
 * plain, non-unique index; admin can and does create multiple venues per
 * location, see POST /api/admin/venues). Every other table that needs to
 * unambiguously name a physical facility (drop_in_sessions, field_rentals,
 * venue_resources) already keys on venueId for the same reason, and
 * requireSameOrgVenue exists alongside requireSameOrgLocation for ownership
 * checks — so venueId is the established shape here, not a special case.
 */
export const classSlotTemplates = pgTable(
  "class_slot_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sportLabel: text("sport_label").notNull().default("Soccer"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    /** 0=Sunday … 6=Saturday, matching JS Date#getUTCDay. */
    weekday: integer("weekday").notNull(),
    /** Local wall-clock start, org timezone (repo convention: UTC storage,
     *  org-tz display — but slot times are WALL times, so store the wall
     *  time and resolve to an instant at materialization). */
    startTime: time("start_time").notNull(),
    durationMins: integer("duration_mins").notNull().default(55),
    capacity: integer("capacity").notNull(),
    /**
     * Per-class pricing for the PAID paths — the make-up booking a parent
     * buys when the child's monthly allotment is exhausted
     * (POST /api/dropin/bookings with familyMemberId), and the quote the
     * 402 from POST /api/classes/book hands the client.
     *
     * These are the CLASS rate source. Without them the only fallback is
     * `drop_in_rate_card`, which is the ADULT PICKUP rate card — a paid
     * kids' class make-up would silently be charged the adult drop-in
     * price. Copied onto each materialized `drop_in_sessions` row by the
     * cron (src/lib/classes/materialize.ts), so the booking endpoints keep
     * reading rates off the SESSION exactly as they do for pickup; the
     * rate-card fallback stays as the last resort for a template (or a
     * one-off class session) that leaves them null.
     *
     * Nullable on purpose: a template that predates this column, or an org
     * that genuinely wants the rate-card default, keeps working.
     */
    sessionRateCents: integer("session_rate_cents"),
    memberRateCents: integer("member_rate_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_slot_templates_org_active_idx").on(table.organizationId, table.active),
  ],
);

/**
 * A child's standing home-slot enrollment. Capacity = count of ACTIVE
 * enrollments per template, checked transactionally against
 * classSlotTemplates.capacity.
 */
export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotTemplateId: uuid("slot_template_id")
      .notNull()
      .references(() => classSlotTemplates.id, { onDelete: "restrict" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    status: classEnrollmentStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("class_enrollments_one_active_per_child_template")
      .on(table.slotTemplateId, table.familyMemberId)
      .where(sql`status = 'active'`),
    index("class_enrollments_child_idx").on(table.familyMemberId, table.status),
    index("class_enrollments_template_status_idx").on(table.slotTemplateId, table.status),
  ],
);

export type ClassSlotTemplate = typeof classSlotTemplates.$inferSelect;
export type NewClassSlotTemplate = typeof classSlotTemplates.$inferInsert;
export type ClassEnrollment = typeof classEnrollments.$inferSelect;

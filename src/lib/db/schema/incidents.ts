import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues, games } from "./teams";
import { users } from "./users";
import { familyMembers } from "./registrations";

/**
 * In-app incident reporting (product-backlog build #1). v1 is fast
 * same-day capture only — see docs/superpowers/plans/2026-07-07-incident-reporting.md.
 *
 * The table carries the full `frm.incident_response.yaml` field set plus
 * columns reserved for the finalization (`act.incident_report_finalization`)
 * and 48h follow-up (`act.incident_followup`) workflows that are an
 * immediate follow-on but not built in this PR — so no second migration is
 * needed when that work lands. Those reserved columns
 * (concussionClearanceStatus, insuranceRelevant, directorConsulted) are
 * nullable and unused by v1 create/read paths.
 */

export const incidentTypeEnum = pgEnum("incident_type", [
  "injury",
  "altercation",
  "medical_event",
  "property_damage",
  "other",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "closed",
]);

// Who the incident is about. `participant` is a registered player/member,
// keyed to an existing family_members row (never resolvePerson() — this is
// not a registration flow, it's referencing an existing registrant).
// Everyone else (bystander/staff/other) is captured as free text — they
// have no family_members row to point at.
export const incidentSubjectTypeEnum = pgEnum("incident_subject_type", [
  "participant",
  "bystander",
  "staff",
  "other",
]);

// Reserved for the follow-on clearance-update admin action (not built in
// this PR): flips pending -> received once written physician/licensed
// health-care-provider clearance is provided per ORC 3707.511.
export const concussionClearanceStatusEnum = pgEnum(
  "concussion_clearance_status",
  ["pending", "received"],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    // Nullable: an incident can be reported outside the context of a
    // specific scheduled game (e.g. an open-gym/pickup session). When
    // present, submission auto-completes that game's
    // act.incident_response activity_completions row.
    gameId: uuid("game_id").references(() => games.id, {
      onDelete: "set null",
    }),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // Subject — exactly one of subjectFamilyMemberId / subjectFreeTextName
    // is populated, per subjectType. Enforced by the CHECK below.
    subjectType: incidentSubjectTypeEnum("subject_type").notNull(),
    subjectFamilyMemberId: uuid("subject_family_member_id").references(
      () => familyMembers.id,
      { onDelete: "restrict" },
    ),
    subjectFreeTextName: varchar("subject_free_text_name", { length: 200 }),

    // frm.incident_response.yaml field set
    incidentType: incidentTypeEnum("incident_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    peopleInvolved: text("people_involved").notNull(),
    firstResponderName: varchar("first_responder_name", {
      length: 200,
    }).notNull(),
    immediateCareGiven: text("immediate_care_given").notNull(),
    emergencyServicesCalled: boolean("emergency_services_called")
      .notNull()
      .default(false),
    emergencyServicesCallTime: timestamp("emergency_services_call_time", {
      withTimezone: true,
    }),
    suspectedConcussion: boolean("suspected_concussion")
      .notNull()
      .default(false),
    removedFromPlay: boolean("removed_from_play"),
    parentNotifiedOnsite: boolean("parent_notified_onsite")
      .notNull()
      .default(false),

    // Reserved for the follow-on finalization/follow-up workflows — nullable,
    // unused by v1.
    concussionClearanceStatus: concussionClearanceStatusEnum(
      "concussion_clearance_status",
    ),
    insuranceRelevant: boolean("insurance_relevant"),
    directorConsulted: boolean("director_consulted"),

    status: incidentStatusEnum("status").notNull().default("open"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("incidents_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("incidents_venue_idx").on(table.venueId),
    index("incidents_game_idx").on(table.gameId),
    index("incidents_subject_family_member_idx").on(
      table.subjectFamilyMemberId,
    ),
    check(
      "incidents_subject_shape",
      sql`(${table.subjectType} = 'participant' AND ${table.subjectFamilyMemberId} IS NOT NULL) OR (${table.subjectType} <> 'participant' AND ${table.subjectFreeTextName} IS NOT NULL)`,
    ),
  ],
);

export const incidentsRelations = relations(incidents, ({ one }) => ({
  organization: one(organizations, {
    fields: [incidents.organizationId],
    references: [organizations.id],
  }),
  venue: one(venues, {
    fields: [incidents.venueId],
    references: [venues.id],
  }),
  game: one(games, {
    fields: [incidents.gameId],
    references: [games.id],
  }),
  reportedByUser: one(users, {
    fields: [incidents.reportedByUserId],
    references: [users.id],
  }),
  subjectFamilyMember: one(familyMembers, {
    fields: [incidents.subjectFamilyMemberId],
    references: [familyMembers.id],
  }),
}));

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;

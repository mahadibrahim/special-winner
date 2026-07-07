import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { teams, gameIncidents } from "./teams";
import { familyMembers } from "./registrations";
import { users } from "./users";

/**
 * Ejection / suspension tracker (product backlog build #4). v1 captures
 * the ejection + a carry-forward suspension record and surfaces a team-level
 * flag to admins/referees, plus a person's ejection history so the director
 * can escalate. See docs/superpowers/plans/2026-07-07-ejection-tracker.md.
 *
 * `season`/`permanent` statuses exist for owner-driven escalation (multiple
 * ejections by the same person) — there is no hardcoded auto-escalation
 * threshold in v1; the director sets these via a follow-on status-transition
 * action, reading the ejection-count surfaced in /admin/suspensions.
 */
export const suspensionStatusEnum = pgEnum("suspension_status", [
  "active",
  "served",
  "appealed",
  "season",
  "permanent",
]);

export const suspensions = pgTable(
  "suspensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Free-text subject — mirrors gameIncidents.player (no roster FK yet).
    personName: varchar("person_name", { length: 120 }).notNull(),
    // Optional hook for a future roster-linked person; unpopulated in v1.
    familyMemberId: uuid("family_member_id").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    // The ejection incident this suspension carries forward from. Restrict:
    // an ejection incident with a suspension attached cannot be deleted out
    // from under it.
    gameIncidentId: uuid("game_incident_id")
      .notNull()
      .references(() => gameIncidents.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    // Owner rule: one game per single ejection by default.
    gamesMissed: integer("games_missed").default(1).notNull(),
    gamesServed: integer("games_served").default(0).notNull(),
    notes: text("notes"),
    status: suspensionStatusEnum("status").default("active").notNull(),
    escalatedToDirector: boolean("escalated_to_director").default(false).notNull(),
    setByUserId: uuid("set_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("suspensions_org_status_idx").on(table.organizationId, table.status),
    index("suspensions_team_idx").on(table.teamId),
    index("suspensions_game_incident_idx").on(table.gameIncidentId),
    check("suspensions_non_negative_games_missed", sql`${table.gamesMissed} >= 0`),
  ],
);

export const suspensionsRelations = relations(suspensions, ({ one }) => ({
  organization: one(organizations, {
    fields: [suspensions.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, {
    fields: [suspensions.teamId],
    references: [teams.id],
  }),
  familyMember: one(familyMembers, {
    fields: [suspensions.familyMemberId],
    references: [familyMembers.id],
  }),
  gameIncident: one(gameIncidents, {
    fields: [suspensions.gameIncidentId],
    references: [gameIncidents.id],
  }),
  setByUser: one(users, {
    fields: [suspensions.setByUserId],
    references: [users.id],
  }),
}));

export type Suspension = typeof suspensions.$inferSelect;
export type NewSuspension = typeof suspensions.$inferInsert;

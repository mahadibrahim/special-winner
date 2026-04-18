import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { programs } from "./programs"
import { teams } from "./teams"
import { users } from "./users"

export const teamGroups = pgTable(
  "team_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    telegramChatId: varchar("telegram_chat_id", { length: 100 }),
    audienceType: varchar("audience_type", { length: 20 }).notNull().default("parents"),
    name: varchar("name", { length: 128 }).notNull(),
    inviteLink: text("invite_link"),
    status: varchar("status", { length: 30 }).notNull().default("scheduled"),
    creationScheduledFor: timestamp("creation_scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    teamIdx: index("team_groups_team_id_idx").on(t.teamId),
    orgIdx: index("team_groups_org_id_idx").on(t.organizationId),
    statusIdx: index("team_groups_status_idx").on(t.status),
    telegramChatIdUnique: uniqueIndex("team_groups_telegram_chat_id_unique").on(t.telegramChatId),
  }),
)

export const teamGroupMemberships = pgTable(
  "team_group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamGroupId: uuid("team_group_id")
      .notNull()
      .references(() => teamGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("parent"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupUserUnique: uniqueIndex("team_group_memberships_group_user_unique").on(t.teamGroupId, t.userId),
    groupIdx: index("team_group_memberships_group_idx").on(t.teamGroupId),
    userIdx: index("team_group_memberships_user_idx").on(t.userId),
  }),
)

export const teamGroupsRelations = relations(teamGroups, ({ one, many }) => ({
  team: one(teams, { fields: [teamGroups.teamId], references: [teams.id] }),
  program: one(programs, { fields: [teamGroups.programId], references: [programs.id] }),
  organization: one(organizations, {
    fields: [teamGroups.organizationId],
    references: [organizations.id],
  }),
  memberships: many(teamGroupMemberships),
}))

export const teamGroupMembershipsRelations = relations(teamGroupMemberships, ({ one }) => ({
  teamGroup: one(teamGroups, {
    fields: [teamGroupMemberships.teamGroupId],
    references: [teamGroups.id],
  }),
  user: one(users, { fields: [teamGroupMemberships.userId], references: [users.id] }),
}))

export type TeamGroup = typeof teamGroups.$inferSelect
export type NewTeamGroup = typeof teamGroups.$inferInsert
export type TeamGroupMembership = typeof teamGroupMemberships.$inferSelect
export type NewTeamGroupMembership = typeof teamGroupMemberships.$inferInsert

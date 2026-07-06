import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * Per-coach onboarding checklist progress (Phase 2 of the coach-lifecycle
 * program). Task keys are a hardcoded constant (see
 * src/lib/compliance/coach-onboarding.ts) — there is no admin-configurable
 * task catalog, so this table only ever stores a *completion event* per
 * (user, org, task). Auto-detected tasks (credentials_complete,
 * first_practice_plan_created) are write-once: the API layer inserts a row
 * here the first time it observes the underlying condition is true, so the
 * checklist has a stable completedAt and does NOT un-complete if the
 * underlying data later regresses (e.g. a credential expires after
 * onboarding) — onboarding is a one-time gate, not continuous monitoring
 * (that is Phase 1's coach-credentials grid's job).
 *
 * organizationId is NOT NULL here, unlike coach_credentials — onboarding is
 * inherently tied to the org that hired the coach; there is no "global"
 * onboarding-task concept to mirror the curriculum content convention.
 */
export const coachOnboardingProgress = pgTable(
  "coach_onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskKey: varchar("task_key", { length: 50 }).notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_onboarding_progress_user_org_task_uniq").on(
      table.userId,
      table.organizationId,
      table.taskKey,
    ),
    index("coach_onboarding_progress_org_idx").on(table.organizationId),
    index("coach_onboarding_progress_user_idx").on(table.userId),
  ],
);

export const coachOnboardingProgressRelations = relations(
  coachOnboardingProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [coachOnboardingProgress.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [coachOnboardingProgress.organizationId],
      references: [organizations.id],
    }),
  }),
);

export type CoachOnboardingProgress = typeof coachOnboardingProgress.$inferSelect;
export type NewCoachOnboardingProgress = typeof coachOnboardingProgress.$inferInsert;

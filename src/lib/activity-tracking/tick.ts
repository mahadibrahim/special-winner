/**
 * Cron tick orchestrator for activity tracking.
 *
 * Each invocation:
 *   1. Selects activity_completions whose status is still actionable
 *      (pending / in_progress / overdue) and whose expected_at is within
 *      the lookahead window (15min ahead of `now` for pre_reminder).
 *   2. For each row, reads the activity definition from the in-process
 *      catalog cache, computes the current stage, and skips if that
 *      stage is already in `reminders_fired` (idempotent re-runs).
 *   3. Applies handoff (updates current_responsible_role +
 *      responsible_history when the stage's target role differs).
 *   4. Flips status `pending → overdue` on first overdue_alert.
 *   5. Resolves recipients via venue_role_assignments, dispatches via
 *      every channel each worker has configured, and appends each
 *      DispatchResult to reminders_fired.
 *
 * Org scoping: each completion row carries its own `organization_id`
 * (snapshotted at bootstrap), so we don't have to walk through games →
 * seasons → programs → locations → organizations on every tick. The
 * dispatcher uses that id for the SMS opt-in scope.
 */
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games, venues } from "@/lib/db/schema/teams";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { computeStage, stageAlreadyFired } from "./stage";
import { computeHandoffTarget } from "./handoff";
import { resolveRecipientsForRole } from "./resolve-recipients";
import { dispatchReminders } from "./dispatch";

export interface TickResult {
  processed: number;
  fired: number;
  errors: number;
}

const PRE_REMINDER_LOOKAHEAD_MINUTES = 15;

export async function runActivityTrackerTick(
  now: Date = new Date(),
): Promise<TickResult> {
  const db = getDb();
  const result: TickResult = { processed: 0, fired: 0, errors: 0 };

  // Pull rows due now or due within the pre-reminder lookahead window.
  // Status filter excludes terminal states (completed, canceled,
  // skipped_by_handoff) so we don't re-process resolved work.
  const lookaheadCutoff = new Date(
    now.getTime() + PRE_REMINDER_LOOKAHEAD_MINUTES * 60 * 1000,
  );
  const due = await db
    .select()
    .from(activityCompletions)
    .where(
      and(
        inArray(activityCompletions.status, [
          "pending",
          "in_progress",
          "overdue",
        ]),
        lte(activityCompletions.expectedAt, lookaheadCutoff),
      ),
    );

  const catalog = await getCatalog();
  const publicAppUrl =
    import.meta.env.PUBLIC_APP_URL ?? "https://app.example.com";

  for (const c of due) {
    try {
      const activity = catalog.activities.find((a) => a.id === c.activityId);
      if (!activity) {
        result.processed++;
        continue;
      }

      const stage = computeStage(now, c.expectedAt, activity.reminder_policy);
      if (!stage) {
        result.processed++;
        continue;
      }

      if (stageAlreadyFired(c.remindersFired as unknown[], stage)) {
        result.processed++;
        continue;
      }

      // Handoff — update current_responsible_role + history before dispatch
      // so recipient resolution targets the new role.
      let currentResponsibleRole = c.currentResponsibleRole;
      const handoffTarget = computeHandoffTarget(activity, stage);
      if (handoffTarget && handoffTarget !== currentResponsibleRole) {
        currentResponsibleRole = handoffTarget;
        const newHistory = [
          ...((c.responsibleHistory as unknown[]) ?? []),
          {
            role: handoffTarget,
            assigned_at: now.toISOString(),
            reason: `handoff_${stage}`,
          },
        ];
        await db
          .update(activityCompletions)
          .set({
            currentResponsibleRole,
            responsibleHistory: newHistory,
            updatedAt: now,
          })
          .where(eq(activityCompletions.id, c.id));
      }

      // Status flip on first overdue transition (pre_reminder doesn't flip).
      if (stage === "overdue_alert" && c.status === "pending") {
        await db
          .update(activityCompletions)
          .set({ status: "overdue", updatedAt: now })
          .where(eq(activityCompletions.id, c.id));
      }

      // Look up game/venue/org for the dispatch context. The completion
      // row already carries organizationId for SMS scoping, so we only
      // need the venue + game + timezone here.
      const [gameRow] = await db
        .select({ game: games, venue: venues, org: organizations })
        .from(games)
        .leftJoin(venues, eq(games.venueId, venues.id))
        .leftJoin(locations, eq(venues.locationId, locations.id))
        .leftJoin(organizations, eq(locations.organizationId, organizations.id))
        .where(eq(games.id, c.gameId))
        .limit(1);
      if (!gameRow?.game || !gameRow.venue) {
        result.processed++;
        continue;
      }

      const recipients = await resolveRecipientsForRole(
        gameRow.venue.id,
        currentResponsibleRole,
        now,
      );
      if (recipients.length === 0) {
        result.processed++;
        continue;
      }

      const dispatched = await dispatchReminders(
        stage,
        recipients,
        {
          activity: {
            id: activity.id,
            name: activity.name,
            description: activity.description,
          },
          completion: { id: c.id, expectedAt: c.expectedAt },
          game: {
            id: gameRow.game.id,
            scheduledAt: gameRow.game.scheduledAt,
          },
          venue: {
            id: gameRow.venue.id,
            name: gameRow.venue.name,
            timezone: gameRow.org?.timezone ?? "America/New_York",
          },
          publicAppUrl,
          handoffRole: handoffTarget,
        },
        c.organizationId,
      );

      const newFired = [
        ...((c.remindersFired as unknown[]) ?? []),
        ...dispatched,
      ];
      await db
        .update(activityCompletions)
        .set({ remindersFired: newFired, updatedAt: now })
        .where(eq(activityCompletions.id, c.id));

      result.fired += dispatched.length;
    } catch (err) {
      result.errors++;
      console.error("[tracker-tick]", c.id, err);
    }
    result.processed++;
  }

  return result;
}

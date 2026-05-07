/**
 * Lifecycle hooks for activity_completions.
 *
 * Bootstrap (`./bootstrap.ts`) seeds rows on game creation. This module
 * handles two post-creation transitions:
 *
 *   - rescheduleActivityCompletions: game's scheduledAt moved → recompute
 *     expected_at for every still-actionable row, demote overdue→pending,
 *     clear reminders_fired so the cron tick re-evaluates from a clean
 *     slate.
 *   - cancelActivityCompletions: game flipped to cancelled/postponed →
 *     mark every still-actionable row as canceled. Completed rows are
 *     preserved so historical work isn't erased.
 *
 * "Still-actionable" = status in (pending | in_progress | overdue).
 * Completed and skipped_by_handoff rows are never touched here.
 *
 * Org context: same as bootstrap — `games` does not carry an
 * organization_id column, so we resolve via `games → seasons → programs
 *  → locations → organizations` for the timezone read.
 */
import { getDb } from "@/lib/db";
import { games } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { computeExpectedAt } from "./dsl";

export async function rescheduleActivityCompletions(
  gameId: string,
): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({ game: games, org: organizations })
    .from(games)
    .leftJoin(seasons, eq(games.seasonId, seasons.id))
    .leftJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(locations, eq(programs.locationId, locations.id))
    .leftJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!row?.game) {
    throw new Error(`Game ${gameId} not found`);
  }
  const orgTz = row.org?.timezone ?? "America/New_York";

  const catalog = await getCatalog();
  const completions = await db
    .select()
    .from(activityCompletions)
    .where(
      and(
        eq(activityCompletions.gameId, gameId),
        inArray(activityCompletions.status, [
          "pending",
          "in_progress",
          "overdue",
        ]),
      ),
    );

  for (const c of completions) {
    const activity = catalog.activities.find((a) => a.id === c.activityId);
    if (!activity) continue;

    const newAt = computeExpectedAt(
      activity.expected_completion,
      { scheduledAt: row.game.scheduledAt },
      orgTz,
      activity.phase,
    );

    await db
      .update(activityCompletions)
      .set({
        expectedAt: newAt ?? row.game.scheduledAt,
        // Demote overdue back to pending — the new expected_at may be in
        // the future. in_progress rows stay in_progress; the user is
        // actively working on them.
        status: c.status === "overdue" ? "pending" : c.status,
        // Reminders fired against the old expected_at are stale; let the
        // cron tick re-evaluate from a clean slate against the new time.
        remindersFired: [],
        updatedAt: new Date(),
      })
      .where(eq(activityCompletions.id, c.id));
  }
}

export async function cancelActivityCompletions(
  gameId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(activityCompletions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(
      and(
        eq(activityCompletions.gameId, gameId),
        inArray(activityCompletions.status, [
          "pending",
          "in_progress",
          "overdue",
        ]),
      ),
    );
}

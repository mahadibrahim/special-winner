/**
 * Helpers that flip activity_completions rows to "completed".
 *
 * Three entry points:
 *   - `markCompleteBySystemEvent(gameId, eventType)` — the platform fires
 *     this from inside the code path that performs the system event
 *     (e.g. cancellation broadcast, daily digest send). It looks up
 *     every catalog activity whose `tracking_method` is `system_event`
 *     and whose `tracking_artifact.event_type` matches `eventType`,
 *     then completes the matching activity_completions rows for the
 *     given game in one update.
 *   - `markComplete(completionId, opts)` — single-row complete, used by
 *     the activity-submit endpoints (Phase E) and any direct mark-as-done
 *     control on the dashboard.
 *   - `markCompleteByExternalAck(...)` — placeholder for the external-ack
 *     surface (payroll/finance acks, etc.) that won't be wired until the
 *     payroll integration lands. Returns 0 today.
 *
 * Idempotency: every helper restricts the update to rows in
 * `pending|in_progress|overdue`. Already-completed/canceled/skipped rows
 * are not touched, so callers can fire-and-forget without worrying about
 * double-completes wiping out historical `completedAt` values.
 */
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";

/**
 * Mark every activity_completions row for `gameId` whose underlying
 * activity is `tracking_method=system_event` AND whose
 * `tracking_artifact.event_type === eventType` as completed.
 *
 * Returns the number of rows actually updated (0 if no catalog activity
 * matches `eventType`, or if every matching row is already terminal).
 */
export async function markCompleteBySystemEvent(
  gameId: string,
  eventType: string,
): Promise<number> {
  const db = getDb();
  const catalog = await getCatalog();

  const activitiesUsingEvent = catalog.activities.filter((a) => {
    if (a.tracking_method !== "system_event") return false;
    const artifact = a.tracking_artifact as { event_type?: string };
    return artifact.event_type === eventType;
  });
  if (activitiesUsingEvent.length === 0) return 0;

  const activityIds = activitiesUsingEvent.map((a) => a.id);
  const now = new Date();
  const result = await db
    .update(activityCompletions)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(
      and(
        eq(activityCompletions.gameId, gameId),
        inArray(activityCompletions.activityId, activityIds),
        inArray(activityCompletions.status, [
          "pending",
          "in_progress",
          "overdue",
        ]),
      ),
    )
    .returning({ id: activityCompletions.id });

  return result.length;
}

/**
 * Flip a single activity_completion to completed by id. Used by submit
 * endpoints once the artifact (checklist/form/signature/photo) is saved.
 */
export async function markComplete(
  completionId: string,
  opts: { byUserId?: string },
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(activityCompletions)
    .set({
      status: "completed",
      completedAt: now,
      completedByUserId: opts.byUserId ?? null,
      updatedAt: now,
    })
    .where(eq(activityCompletions.id, completionId));
}

/**
 * Stub for external-ack completion (e.g. payroll system confirms a
 * payout was issued). The payroll integration is not built yet so this
 * is a no-op today; signature is preserved so callers can wire it up
 * once the underlying ingestion endpoint exists.
 */
export async function markCompleteByExternalAck(
  _gameId: string,
  _externalSystem: string,
  _recordKind: string,
  _externalRef: string,
): Promise<number> {
  // Awaiting the external-ack ingest surface (Plan 4+).
  return 0;
}

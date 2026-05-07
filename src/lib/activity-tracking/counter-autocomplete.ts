/**
 * Counter auto-complete pass.
 *
 * For each `activity_completions` row that:
 *   - has status pending or in_progress,
 *   - is past its expected_at (so it's effectively due),
 *   - and is bound to an activity whose `tracking_method` is
 *     `counter_increment`,
 * we look up the configured counter source, query the current count
 * for that game, and mark the row complete if `count >= min_count`.
 *
 * Counter source adapters are stub-by-default: the tables that back
 * walk-on registrations, live game scores, and photo upload/publish
 * counts don't ship as part of this plan — they're implemented in
 * Plan 4+. Until those tables exist, every adapter returns 0. Tests
 * inject a real source via `_setCounterSourceForTests` to verify the
 * auto-complete logic itself.
 *
 * Order of operations: this pass runs at the END of `runActivityTrackerTick`
 * so that any pre-reminder / overdue dispatch already happened first.
 * Activities that this pass marks complete won't fire any further
 * reminders on subsequent ticks (the main tick filters out completed
 * rows).
 */
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";

type CounterSource = (gameId: string) => Promise<number>;

// Default adapter set. Each entry is documented with the table/feature
// that will replace the stub when that platform piece ships.
//
// `mediaAssets` exists today but does NOT carry `gameId` directly —
// game association flows through `shoot_sessions.gameId`. There is also
// no `media_kind` column on `media_assets`; the catalog references
// strings like `signage_setup` / `field_setup` that don't yet have a
// schema-level home. Rather than ship a partial / mismatched query,
// the photo adapters stay as stubs until the media + per-game tracking
// surface lands together.
const _defaultCounterSources: Record<string, CounterSource> = {
  // Awaiting the per-feature platform work in Plan 4 (counter service +
  // walk-on registrations table). Until then, return 0.
  "counter.walk_on_registrations": async (_gameId) => 0,

  // Awaiting the live-scoring feature (Plan 4+). Will query the
  // `game_events` / scoring table once it exists.
  "counter.live_scores": async (_gameId) => 0,

  // mediaAssets has no gameId column — game association is via
  // shoot_sessions. Adapter awaits the per-game photo bookkeeping
  // surface; until then, return 0.
  "counter.photos_uploaded": async (_gameId) => 0,

  // No `published` flag on mediaAssets that's per-game queryable yet.
  // Awaits the photo publish workflow (Plan 4+).
  "counter.photos_published": async (_gameId) => 0,
};

// Mutable runtime map — tests override individual entries via
// `_setCounterSourceForTests` and reset via
// `_resetCounterSourcesForTests`. Production code paths read from this
// directly and never mutate it.
let _counterSources: Record<string, CounterSource> = {
  ..._defaultCounterSources,
};

export function _setCounterSourceForTests(
  counterId: string,
  source: CounterSource,
): void {
  _counterSources[counterId] = source;
}

export function _resetCounterSourcesForTests(): void {
  _counterSources = { ..._defaultCounterSources };
}

export interface CounterAutoCompleteResult {
  completed: number;
  overdue: number;
}

export async function runCounterAutoComplete(
  now: Date = new Date(),
): Promise<CounterAutoCompleteResult> {
  const db = getDb();
  const result: CounterAutoCompleteResult = { completed: 0, overdue: 0 };
  const catalog = await getCatalog();

  const candidates = await db
    .select()
    .from(activityCompletions)
    .where(
      and(
        lte(activityCompletions.expectedAt, now),
        inArray(activityCompletions.status, ["pending", "in_progress"]),
      ),
    );

  for (const c of candidates) {
    const activity = catalog.activities.find((a) => a.id === c.activityId);
    if (!activity || activity.tracking_method !== "counter_increment") {
      continue;
    }

    const artifact = activity.tracking_artifact as {
      counter?: string;
      min_count?: number;
    };
    const counterId = artifact.counter;
    const minCount = artifact.min_count ?? 0;
    if (!counterId) continue;

    const source = _counterSources[counterId];
    if (!source) {
      console.warn(
        `[counter-autocomplete] no source registered for ${counterId}`,
      );
      continue;
    }

    let count = 0;
    try {
      count = await source(c.gameId);
    } catch (err) {
      console.error(
        `[counter-autocomplete] source ${counterId} threw for game ${c.gameId}:`,
        err,
      );
      continue;
    }

    if (count >= minCount) {
      await db
        .update(activityCompletions)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(activityCompletions.id, c.id));
      result.completed++;
    } else {
      // Below threshold — leave to the main tick, which will surface
      // an overdue_alert if the row is past its overdue window.
      result.overdue++;
    }
  }

  return result;
}

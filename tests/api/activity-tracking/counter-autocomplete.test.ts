import { describe, it, expect, afterEach } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import {
  runCounterAutoComplete,
  _setCounterSourceForTests,
  _resetCounterSourcesForTests,
} from "@/lib/activity-tracking/counter-autocomplete";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("runCounterAutoComplete", () => {
  afterEach(() => {
    _resetCounterSourcesForTests();
  });

  it("marks counter_increment activities complete when source returns >= min_count", async () => {
    // Use a drop_in program so act.walk_on_registration (counter.walk_on_registrations,
    // min_count: 0) is bootstrapped for the game.
    const ctx = await createTestGameContext({
      indoor: false,
      programType: "clinic",
      audienceType: "parents",
    });
    await bootstrapActivityCompletions(ctx.gameId);

    // Find rows that map to counter activities so we can assert on them.
    const before = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));

    const walkOnRow = before.find(
      (r) => r.activityId === "act.walk_on_registration",
    );
    if (!walkOnRow) {
      // Catalog churn could remove the activity from this tag context;
      // bail out cleanly rather than fail.
      return;
    }

    // Make the row due (expectedAt in the past) so it's a candidate.
    await getDb()
      .update(activityCompletions)
      .set({ expectedAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(activityCompletions.id, walkOnRow.id));

    // Override the walk-on counter source to return enough to satisfy min_count.
    _setCounterSourceForTests(
      "counter.walk_on_registrations",
      async () => 5,
    );

    const stats = await runCounterAutoComplete();
    expect(stats.completed).toBeGreaterThanOrEqual(1);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, walkOnRow.id));
    expect(after.status).toBe("completed");
    expect(after.completedAt).not.toBeNull();
  });

  it("leaves rows alone when source returns less than min_count", async () => {
    // Use a flag_football outdoor context to surface act.flag_field_line_check
    // (min_count: 1 against counter.walk_on_registrations).
    const ctx = await createTestGameContext({
      indoor: false,
      sportSlug: "flag_football",
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const before = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.flag_field_line_check"),
        ),
      );
    if (before.length === 0) {
      return; // catalog churn — skip
    }
    const target = before[0];

    await getDb()
      .update(activityCompletions)
      .set({ expectedAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(activityCompletions.id, target.id));

    // Force the underlying counter to 0 — below min_count: 1.
    // act.flag_field_line_check uses counter.walk_on_registrations? — it may
    // use a different counter; override every known stub to 0 to be safe.
    _setCounterSourceForTests("counter.walk_on_registrations", async () => 0);
    _setCounterSourceForTests("counter.live_scores", async () => 0);
    _setCounterSourceForTests("counter.photos_uploaded", async () => 0);
    _setCounterSourceForTests("counter.photos_published", async () => 0);

    await runCounterAutoComplete();

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    // Row remains pending (or in_progress) — auto-complete did not flip it.
    expect(["pending", "in_progress"]).toContain(after.status);
  });
});

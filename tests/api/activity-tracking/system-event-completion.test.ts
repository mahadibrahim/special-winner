import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import {
  markCompleteBySystemEvent,
  markComplete,
} from "@/lib/activity-tracking/mark-complete";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("markCompleteBySystemEvent", () => {
  it("marks the matching activity complete when the system event fires", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    // act.cancellation_broadcast is system_event with
    // event_type=evt.cancellation_broadcast_sent and bootstraps for every
    // game (no tag filters), so the row will exist.
    const before = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.cancellation_broadcast"),
        ),
      );
    expect(before.length).toBe(1);
    expect(["pending", "in_progress", "overdue"]).toContain(before[0].status);

    const n = await markCompleteBySystemEvent(
      ctx.gameId,
      "evt.cancellation_broadcast_sent",
    );
    expect(n).toBe(1);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.cancellation_broadcast"),
        ),
      );
    expect(after.status).toBe("completed");
    expect(after.completedAt).not.toBeNull();
  });

  it("returns 0 when no activity uses the given event_type", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const n = await markCompleteBySystemEvent(
      ctx.gameId,
      "evt.this_event_does_not_exist_in_catalog",
    );
    expect(n).toBe(0);
  });

  it("does not flip already-completed rows back", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [row] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.cancellation_broadcast"),
        ),
      );
    if (!row) return;

    const firstCompletedAt = new Date("2026-01-01T00:00:00Z");
    await getDb()
      .update(activityCompletions)
      .set({ status: "completed", completedAt: firstCompletedAt })
      .where(eq(activityCompletions.id, row.id));

    const n = await markCompleteBySystemEvent(
      ctx.gameId,
      "evt.cancellation_broadcast_sent",
    );
    // Already-completed rows are excluded from the update.
    expect(n).toBe(0);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, row.id));
    expect(after.completedAt?.toISOString()).toBe(
      firstCompletedAt.toISOString(),
    );
  });
});

describe("markComplete", () => {
  it("flips a completion row to completed by id", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [row] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(row).toBeDefined();

    await markComplete(row.id, {});

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, row.id));
    expect(after.status).toBe("completed");
    expect(after.completedAt).not.toBeNull();
  });
});

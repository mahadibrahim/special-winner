import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games } from "@/lib/db/schema/teams";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { rescheduleActivityCompletions } from "@/lib/activity-tracking/lifecycle";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("rescheduleActivityCompletions", () => {
  it("recomputes expected_at when scheduledAt changes", async () => {
    const ctx = await createTestGameContext({
      scheduledAt: new Date("2026-06-03T18:00:00Z"),
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const before = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const rb = before.find((r) => r.activityId === "act.rainout_decision");
    expect(rb).toBeDefined();

    // Move kickoff out by 2h; act.rainout_decision is T-90min so its
    // expected_at must shift by exactly +2h.
    await getDb()
      .update(games)
      .set({ scheduledAt: new Date("2026-06-03T20:00:00Z") })
      .where(eq(games.id, ctx.gameId));

    await rescheduleActivityCompletions(ctx.gameId);

    const after = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const ra = after.find((r) => r.activityId === "act.rainout_decision");
    expect(ra).toBeDefined();
    expect(ra!.expectedAt.getTime() - rb!.expectedAt.getTime()).toBe(
      2 * 60 * 60 * 1000,
    );
  });

  it("resets overdue → pending and clears reminders_fired", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    await getDb()
      .update(activityCompletions)
      .set({
        status: "overdue",
        remindersFired: [{ stage: "overdue_alert" }],
      })
      .where(eq(activityCompletions.gameId, ctx.gameId));

    await rescheduleActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(
      rows.every(
        (r) =>
          Array.isArray(r.remindersFired) &&
          (r.remindersFired as unknown[]).length === 0,
      ),
    ).toBe(true);
  });

  it("does not touch completed rows", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    await getDb()
      .update(activityCompletions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(activityCompletions.gameId, ctx.gameId));

    await rescheduleActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.every((r) => r.status === "completed")).toBe(true);
  });
});

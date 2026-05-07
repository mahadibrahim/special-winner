import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { cancelActivityCompletions } from "@/lib/activity-tracking/lifecycle";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("cancelActivityCompletions", () => {
  it("flips pending/overdue rows to canceled, preserves completed rows", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.length).toBeGreaterThan(0);

    // Mark one row completed before cancel — it must survive.
    const target = rows[0];
    await getDb()
      .update(activityCompletions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(activityCompletions.id, target.id));

    await cancelActivityCompletions(ctx.gameId);

    const after = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(after.find((r) => r.id === target.id)?.status).toBe("completed");
    expect(
      after
        .filter((r) => r.id !== target.id)
        .every((r) => r.status === "canceled"),
    ).toBe(true);
  });
});

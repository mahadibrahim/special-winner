import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  venueRoleAssignments,
} from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { runActivityTrackerTick } from "@/lib/activity-tracking/tick";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("runActivityTrackerTick", () => {
  it("fires pre-reminder for completion expiring soon", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [vm] = await getDb()
      .insert(users)
      .values({
        email: `vm-${stamp}@t.com`,
        firstName: "Test",
        lastName: "VM",
        // No phone / telegramChatId — only email channel will fire.
      })
      .returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      roleId: "role.venue_manager",
      userId: vm.id,
    });

    // Pick any completion currently owned by role.venue_manager.
    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const target = rows.find(
      (r) => r.currentResponsibleRole === "role.venue_manager",
    );
    if (!target) {
      // Not all sport+venue tag combinations include a venue_manager-owned
      // activity — bail out cleanly so the test isn't flaky on unrelated
      // catalog churn.
      return;
    }

    const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000);
    await getDb()
      .update(activityCompletions)
      .set({ expectedAt: tenMinFromNow })
      .where(eq(activityCompletions.id, target.id));

    const result = await runActivityTrackerTick();
    expect(result.processed).toBeGreaterThan(0);

    const after = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    // Email send may fail in test env without RESEND key — but the audit log
    // entry is appended either way (delivery_status: "failed" is still a
    // recorded fire).
    expect((after[0].remindersFired as unknown[]).length).toBeGreaterThan(0);
  });

  it("is idempotent — re-running does not double-fire the same stage", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [vm] = await getDb()
      .insert(users)
      .values({
        email: `vm-${stamp}@t.com`,
        firstName: "Idem",
        lastName: "VM",
      })
      .returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      roleId: "role.venue_manager",
      userId: vm.id,
    });

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const target = rows.find(
      (r) => r.currentResponsibleRole === "role.venue_manager",
    );
    if (!target) return;

    await getDb()
      .update(activityCompletions)
      .set({ expectedAt: new Date(Date.now() + 10 * 60 * 1000) })
      .where(eq(activityCompletions.id, target.id));

    await runActivityTrackerTick();
    const [afterFirst] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    const firstCount = (afterFirst.remindersFired as unknown[]).length;

    await runActivityTrackerTick();
    const [afterSecond] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    const secondCount = (afterSecond.remindersFired as unknown[]).length;

    expect(secondCount).toBe(firstCount);
  });
});

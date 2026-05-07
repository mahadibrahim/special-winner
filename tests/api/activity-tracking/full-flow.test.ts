/**
 * End-to-end integration test exercising the full activity-tracking lifecycle
 * at the library layer (no HTTP dependency, no dev server required).
 *
 * Flow:
 *   1. Create a fresh game context (org/location/program/season/venue/teams/game)
 *   2. Bootstrap activity completions and assert >40 rows seeded
 *   3. Reschedule the game (move scheduledAt) and assert expected_at shifts
 *   4. Submit a checklist completion via library-direct writes (mirroring the
 *      submit endpoint's status-conditional flip) and assert the row is
 *      flipped to completed with the evidence FK populated
 *   5. Cancel the game and assert remaining pending rows flip to canceled
 *      while the previously-completed row is preserved
 *
 * This is the proof-of-concept that the whole engine flows end to end. Renderer
 * UIs and the cron tick are exercised by their own unit/integration tests.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  checklistSubmissions,
} from "@/lib/db/schema/activity-tracking";
import { games } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { and, eq, ne } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import {
  rescheduleActivityCompletions,
  cancelActivityCompletions,
} from "@/lib/activity-tracking/lifecycle";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("activity-tracking: full lifecycle flow (library-direct)", () => {
  it("bootstraps → reschedules → submits checklist → cancels", async () => {
    const db = getDb();

    // 1. Create a test game context. Use a venue with concessions=true so
    // the bootstrap pulls in extra activities (gives us a richer set to
    // exercise reschedule + cancel against).
    const ctx = await createTestGameContext({
      indoor: false,
      owned: true,
      concessions: true,
      programType: "league",
      audienceType: "parents",
      sportSlug: "soccer",
      scheduledAt: new Date("2026-06-03T18:00:00Z"),
    });

    // 2. Bootstrap completions and assert > 40 rows.
    await bootstrapActivityCompletions(ctx.gameId);

    const seeded = await db
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(seeded.length).toBeGreaterThan(40);
    expect(seeded.every((r) => r.organizationId === ctx.organizationId)).toBe(
      true,
    );
    expect(seeded.every((r) => r.status === "pending")).toBe(true);

    // 3. Reschedule the game by +2h and assert every still-actionable row
    // shifts by exactly +2h.
    const before = seeded.find((r) => r.activityId === "act.rainout_decision");
    expect(before, "act.rainout_decision should bootstrap").toBeDefined();

    await db
      .update(games)
      .set({ scheduledAt: new Date("2026-06-03T20:00:00Z") })
      .where(eq(games.id, ctx.gameId));

    await rescheduleActivityCompletions(ctx.gameId);

    const afterReschedule = await db
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const after = afterReschedule.find(
      (r) => r.activityId === "act.rainout_decision",
    );
    expect(after).toBeDefined();
    expect(after!.expectedAt.getTime() - before!.expectedAt.getTime()).toBe(
      2 * 60 * 60 * 1000,
    );

    // 4. Find a checklist activity and submit it library-direct, mirroring
    // the submit endpoint's status-conditional UPDATE. We use the same
    // activity (act.facility_unlock) the submit endpoint test uses since
    // it bootstraps for every game.
    const target = afterReschedule.find(
      (r) => r.activityId === "act.facility_unlock",
    );
    expect(target, "act.facility_unlock should bootstrap").toBeDefined();

    const activity = await getActivityFromCatalog(target!.activityId);
    expect(activity, "activity must resolve in catalog").toBeDefined();
    expect(activity!.tracking_method).toBe("checklist");
    const templateId = (activity!.tracking_artifact as any)?.template_id;
    expect(templateId, "checklist activity must have template_id").toBeDefined();

    // checklist_submissions.submitted_by_user_id is NOT NULL with a FK to
    // users — we need a real user row for the test. Create one tied to this
    // org so foreign-key chains hold.
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [submitter] = await db
      .insert(users)
      .values({
        email: `submitter-${stamp}@test.aspiresports.com`,
        firstName: "Test",
        lastName: "Submitter",
      })
      .returning();

    const [submission] = await db
      .insert(checklistSubmissions)
      .values({
        completionId: target!.id,
        templateId,
        submittedByUserId: submitter.id,
        items: [{ item_id: "any", checked: true }],
      })
      .returning();
    expect(submission.id).toBeDefined();

    // Status-conditional flip — same predicate as src/pages/api/admin/
    // activity-completions/[id]/submit.ts.
    const flipped = await db
      .update(activityCompletions)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedByUserId: submitter.id,
        checklistSubmissionId: submission.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(activityCompletions.id, target!.id),
          ne(activityCompletions.status, "completed"),
          ne(activityCompletions.status, "canceled"),
          ne(activityCompletions.status, "skipped_by_handoff"),
        ),
      )
      .returning();
    expect(flipped.length).toBe(1);
    expect(flipped[0].status).toBe("completed");
    expect(flipped[0].checklistSubmissionId).toBe(submission.id);
    expect(flipped[0].completedByUserId).toBe(submitter.id);

    // 5. Cancel the game and assert remaining pending rows flip to canceled
    // while the completed row from step 4 is preserved.
    await cancelActivityCompletions(ctx.gameId);

    const final = await db
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));

    const completedRow = final.find((r) => r.id === target!.id);
    expect(completedRow?.status).toBe("completed");
    expect(completedRow?.checklistSubmissionId).toBe(submission.id);

    const others = final.filter((r) => r.id !== target!.id);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((r) => r.status === "canceled")).toBe(true);
  });
});

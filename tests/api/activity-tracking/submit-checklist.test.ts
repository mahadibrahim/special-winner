/**
 * Integration test: POST /api/admin/activity-completions/[id]/submit for
 * a checklist activity. Hits the running dev server.
 *
 * Setup: builds a game inside the seeded admin org so the admin cookie
 * (super_admin → oldest active HQ → "aspire-sports") resolves to the same
 * org as the activity_completions row.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

describe("POST /api/admin/activity-completions/[id]/submit (checklist)", () => {
  it("submits a checklist and marks the completion completed", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));

    // act.facility_unlock is a checklist-method activity that bootstraps
    // for every game (no tag filters that exclude it).
    const target = rows.find((r) => r.activityId === "act.facility_unlock");
    expect(target, "expected act.facility_unlock to be bootstrapped").toBeDefined();

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target!.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({
          items: [{ item_id: "any", checked: true }],
        }),
      },
    );

    expect(res.status).toBe(200);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target!.id));
    expect(after.status).toBe("completed");
    expect(after.checklistSubmissionId).not.toBeNull();
    expect(after.completedByUserId).not.toBeNull();
  });

  it("returns 409 on second submit (already completed)", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.facility_unlock"),
        ),
      );
    expect(target).toBeDefined();

    const cookie = await getAdminCookie();
    const path = `/api/admin/activity-completions/${target.id}/submit`;
    const body = JSON.stringify({
      items: [{ item_id: "any", checked: true }],
    });

    const first = await apiFetch(path, { method: "POST", cookie, body });
    expect(first.status).toBe(200);

    const second = await apiFetch(path, { method: "POST", cookie, body });
    expect(second.status).toBe(409);
  });

  it("returns 400 when items is missing", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.facility_unlock"),
        ),
      );

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await apiFetch(
      `/api/admin/activity-completions/00000000-0000-0000-0000-000000000000/submit`,
      {
        method: "POST",
        body: JSON.stringify({ items: [] }),
      },
    );
    expect(res.status).toBe(401);
  });
});

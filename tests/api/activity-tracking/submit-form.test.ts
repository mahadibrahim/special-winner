/**
 * Integration test: POST /api/admin/activity-completions/[id]/submit for
 * a form-method activity. Hits the running dev server.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  formSubmissions,
} from "@/lib/db/schema/activity-tracking";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

describe("POST /api/admin/activity-completions/[id]/submit (form)", () => {
  it("submits form fields and writes a form_submissions row", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.team_check_in"),
        ),
      );
    expect(target, "expected act.team_check_in to be bootstrapped").toBeDefined();

    const cookie = await getAdminCookie();
    const fields = { roster_present: true, jersey_check: "ok" };
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({ fields }),
      },
    );
    expect(res.status).toBe(200);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    expect(after.status).toBe("completed");
    expect(after.formSubmissionId).not.toBeNull();

    const [sub] = await getDb()
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.id, after.formSubmissionId!));
    expect(sub).toBeDefined();
    expect(sub.fields).toMatchObject(fields);
  });

  it("returns 400 when fields is missing or wrong type", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.team_check_in"),
        ),
      );

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({ fields: "not-an-object" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

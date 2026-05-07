/**
 * Integration test: POST /api/admin/activity-completions/[id]/submit for
 * a signature-method activity. Hits the running dev server.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  signatureSubmissions,
} from "@/lib/db/schema/activity-tracking";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

describe("POST /api/admin/activity-completions/[id]/submit (signature)", () => {
  it("captures typed name + role and marks completed", async () => {
    // Default opts produce a youth league game where act.coach_pregame_briefing
    // bootstraps (format_tags=[league], audience_tags=[youth]).
    const ctx = await createAdminOrgGameContext({
      programType: "league",
      audienceType: "parents",
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.coach_pregame_briefing"),
        ),
      );
    expect(
      target,
      "expected act.coach_pregame_briefing to be bootstrapped",
    ).toBeDefined();

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({ typed_name: "Jane Coach" }),
      },
    );
    expect(res.status).toBe(200);

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    expect(after.status).toBe("completed");
    expect(after.signatureSubmissionId).not.toBeNull();

    const [sub] = await getDb()
      .select()
      .from(signatureSubmissions)
      .where(eq(signatureSubmissions.id, after.signatureSubmissionId!));
    expect(sub.typedName).toBe("Jane Coach");
    expect(sub.signedRole).toBe("role.coach");
  });

  it("returns 400 when typed_name is too short", async () => {
    const ctx = await createAdminOrgGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    const [target] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, ctx.gameId),
          eq(activityCompletions.activityId, "act.coach_pregame_briefing"),
        ),
      );

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({ typed_name: "ab" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

/**
 * Integration test: POST /api/admin/activity-completions/[id]/submit for
 * a signature-method activity. Hits the running dev server.
 *
 * Signing a signature-method activity is a role-attested action: the signer
 * records that they hold `required_role` at the game's venue. The endpoint
 * verifies that against venue_role_assignments (ISS-5) — so the happy path
 * must assign the role first, and signing without it is rejected with 403.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  signatureSubmissions,
  venueRoleAssignments,
} from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

// The seeded admin (super_admin) whose cookie getAdminCookie() returns.
async function adminUserId(): Promise<string> {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@test.aspiresports.com"))
    .limit(1);
  if (!row) throw new Error("admin@test.aspiresports.com not seeded");
  return row.id;
}

describe("POST /api/admin/activity-completions/[id]/submit (signature)", () => {
  it("captures typed name + role and marks completed when signer holds the venue role", async () => {
    // Default opts produce a youth league game where act.coach_pregame_briefing
    // bootstraps (format_tags=[league], audience_tags=[youth]). Its
    // required_role is role.coach.
    const ctx = await createAdminOrgGameContext({
      programType: "league",
      audienceType: "parents",
    });
    await bootstrapActivityCompletions(ctx.gameId);

    // Assign the admin the role.coach venue role so the signature is valid.
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      roleId: "role.coach",
      userId: await adminUserId(),
    });

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

  it("returns 403 when the signer does not hold the required venue role", async () => {
    // Same signature activity, but NO venue_role_assignment for the signer.
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
    expect(target).toBeDefined();

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/${target.id}/submit`,
      {
        method: "POST",
        cookie,
        body: JSON.stringify({ typed_name: "Jane Coach" }),
      },
    );
    expect(res.status).toBe(403);

    // The completion must remain unsigned/incomplete.
    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.id, target.id));
    expect(after.status).not.toBe("completed");
    expect(after.signatureSubmissionId).toBeNull();
  });

  it("returns 400 when typed_name is too short (before the venue-role check)", async () => {
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

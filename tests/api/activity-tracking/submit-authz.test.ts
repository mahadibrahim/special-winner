/**
 * Authorization regression tests for
 * POST /api/admin/activity-completions/[id]/submit (ISS-5).
 *
 * The endpoint is super-admin-only and org-snapshot scoped. These tests lock
 * in that an org-bound admin (a location_admin) cannot sign off a completion
 * — which is the issue's literal acceptance ("an admin scoped to one org
 * cannot sign off another's completion → 403") — and that non-admins are
 * rejected entirely. super_admin is a *global* role, so it legitimately
 * spans orgs; the org boundary that matters is the location_admin one, and
 * the super-admin gate enforces it.
 *
 * Hits the running dev server.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import {
  apiFetch,
  getAuthCookie,
  getParentCookie,
} from "../setup/test-helpers";

let completionId: string;

beforeAll(async () => {
  // A real completion in the admin's (HQ) org. The role/auth gate fires
  // before the row is loaded, so the exact activity doesn't matter — we just
  // need a valid id to prove the request is rejected on identity, not 404.
  const ctx = await createAdminOrgGameContext({
    programType: "league",
    audienceType: "parents",
  });
  await bootstrapActivityCompletions(ctx.gameId);

  const [row] = await getDb()
    .select({ id: activityCompletions.id })
    .from(activityCompletions)
    .where(eq(activityCompletions.gameId, ctx.gameId))
    .limit(1);
  if (!row) throw new Error("expected a bootstrapped completion");
  completionId = row.id;
});

function submitAs(cookie?: string) {
  return apiFetch(`/api/admin/activity-completions/${completionId}/submit`, {
    method: "POST",
    ...(cookie ? { cookie } : {}),
    body: JSON.stringify({ typed_name: "Someone Else" }),
  });
}

describe("POST /api/admin/activity-completions/[id]/submit (authz)", () => {
  it("rejects an org-bound admin (location_admin) with 403", async () => {
    // admin-orgb is a location_admin scoped to Org B — not a super_admin.
    const cookie = await getAuthCookie(
      "admin-orgb@test.aspiresports.com",
      "TestAdmin123!",
    );
    const res = await submitAs(cookie);
    expect(res.status).toBe(403);
  });

  it("rejects a non-admin (parent) with 403", async () => {
    const cookie = await getParentCookie();
    const res = await submitAs(cookie);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await submitAs();
    expect(res.status).toBe(401);
  });
});

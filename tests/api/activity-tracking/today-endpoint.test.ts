/**
 * Integration test: GET /api/admin/activity-completions/today
 *
 * Hits the running dev server. Uses createAdminOrgGameContext so the
 * fixture rows live in the seeded admin org (which the cookie resolves
 * to via super_admin → oldest active HQ → "aspire-sports"). The day
 * filter is applied via expected_at — bootstrap derives expected_at
 * from `game.scheduledAt`, so we set scheduledAt to a known UTC day.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

describe("GET /api/admin/activity-completions/today", () => {
  it("returns rows from the requested date, hides closed by default", async () => {
    const targetDate = "2026-08-15";
    const ctx = await createAdminOrgGameContext({
      scheduledAt: new Date(`${targetDate}T18:00:00Z`),
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const cookie = await getAdminCookie();

    // Mark one row completed so we can verify the closed-status filter.
    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.length).toBeGreaterThan(0);
    const closedRow = rows[0];
    await getDb()
      .update(activityCompletions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(activityCompletions.id, closedRow.id));

    const res = await apiFetch(
      `/api/admin/activity-completions/today?date=${targetDate}`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe(targetDate);
    expect(Array.isArray(body.rows)).toBe(true);

    // Our game's rows should be present (minus the completed one).
    const ourRows = body.rows.filter(
      (r: { gameId: string }) => r.gameId === ctx.gameId,
    );
    expect(ourRows.length).toBeGreaterThan(0);
    expect(ourRows.find((r: { id: string }) => r.id === closedRow.id)).toBeUndefined();

    // includeClosed=1 should bring it back.
    const resAll = await apiFetch(
      `/api/admin/activity-completions/today?date=${targetDate}&includeClosed=1`,
      { method: "GET", cookie },
    );
    expect(resAll.status).toBe(200);
    const bodyAll = await resAll.json();
    const ourAll = bodyAll.rows.filter(
      (r: { gameId: string }) => r.gameId === ctx.gameId,
    );
    expect(ourAll.find((r: { id: string }) => r.id === closedRow.id)).toBeDefined();
  });

  it("does not return rows from a different calendar date", async () => {
    const ctx = await createAdminOrgGameContext({
      scheduledAt: new Date("2026-09-10T18:00:00Z"),
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/today?date=2026-09-11`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ourRows = body.rows.filter(
      (r: { gameId: string }) => r.gameId === ctx.gameId,
    );
    expect(ourRows.length).toBe(0);
  });

  it("rejects malformed date param", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/activity-completions/today?date=not-a-date`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await apiFetch(`/api/admin/activity-completions/today`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });
});

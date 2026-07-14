/**
 * Integration test: GET /api/admin/activity-completions/today
 *
 * Hits the running dev server. Uses createAdminOrgGameContext so the
 * fixture rows live in the seeded admin org (which the cookie resolves
 * to via super_admin → oldest active HQ → "aspire-sports").
 *
 * The endpoint filters by expected_at in the org's timezone (currently
 * America/New_York for the seeded admin org). Tests pin assertions to
 * specific activities whose expected_at is known to fall on (or off)
 * the queried date — pre_day and post_day activities span multiple
 * days, so "all rows for game X" can legitimately span dates.
 *
 * `act.timekeeping` is in_game phase_end (kickoff + 90min); always
 * lands on the same calendar day as kickoff in the org tz.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { organizations } from "@/lib/db/schema/organizations";
import { and, asc, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

describe("GET /api/admin/activity-completions/today", () => {
  it("returns rows from the requested date, hides closed by default", async () => {
    const targetDate = "2026-08-15";
    // 18:00 UTC = 14:00 EDT — keeps in_game expected_at (T+90min) on
    // the same EDT calendar day as kickoff.
    const ctx = await createAdminOrgGameContext({
      scheduledAt: new Date(`${targetDate}T18:00:00Z`),
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const cookie = await getAdminCookie();

    // Pick an activity whose expected_at is guaranteed to fall on the
    // queried date in the org timezone. act.timekeeping = in_game
    // phase_end (kickoff + 90min), same calendar day as kickoff.
    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));
    const closedRow = rows.find((r) => r.activityId === "act.timekeeping");
    expect(closedRow).toBeDefined();

    await getDb()
      .update(activityCompletions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(activityCompletions.id, closedRow!.id));

    const res = await apiFetch(
      `/api/admin/activity-completions/today?date=${targetDate}`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe(targetDate);
    expect(Array.isArray(body.rows)).toBe(true);

    // Our game's in_game rows should be present (minus the completed one).
    const ourRows = body.rows.filter(
      (r: { gameId: string }) => r.gameId === ctx.gameId,
    );
    expect(ourRows.length).toBeGreaterThan(0);
    expect(ourRows.find((r: { id: string }) => r.id === closedRow!.id)).toBeUndefined();

    // includeClosed=1 should bring the completed row back.
    const resAll = await apiFetch(
      `/api/admin/activity-completions/today?date=${targetDate}&includeClosed=1`,
      { method: "GET", cookie },
    );
    expect(resAll.status).toBe(200);
    const bodyAll = await resAll.json();
    const ourAll = bodyAll.rows.filter(
      (r: { gameId: string }) => r.gameId === ctx.gameId,
    );
    expect(ourAll.find((r: { id: string }) => r.id === closedRow!.id)).toBeDefined();
  });

  it("does not return same-day-only activities under a different calendar date", async () => {
    // Kickoff 14:00 EDT on 2026-09-10 — in_game timekeeping completes
    // 15:30 EDT on 2026-09-10 and must NOT appear under a 2026-09-11 query.
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

    // Note: post_day activities (T+24h, T+72h) and end_of_day (21:00
    // local) legitimately appear on later dates — that's the intended
    // dashboard behavior. The precise check is that activities pinned
    // to kickoff day (in_game, post_game) do not bleed into other days.
    const inGameOnWrongDay = body.rows.find(
      (r: { gameId: string; activityId: string }) =>
        r.gameId === ctx.gameId && r.activityId === "act.timekeeping",
    );
    expect(inGameOnWrongDay).toBeUndefined();
  });

  it("default date resolves in the org row's timezone (locals-populated primary path)", async () => {
    // Perf batch B changed the endpoint to read the timezone from
    // locals.organization instead of re-querying the org row. Over
    // localhost this IS the primary path: the domain resolver's
    // resolveDefaultOrganization() fallback (domain-resolver.ts) populates
    // locals.organization with the oldest active HQ org for any host that
    // matches no custom domain/subdomain — localhost included. So the
    // request below exercises the locals read, not the defensive DB
    // fallback. We can't cheaply count queries over HTTP, so the assertion
    // is output-equivalence: the endpoint's default `date` (no ?date param)
    // must equal "today" computed in the timezone stored on the org row
    // the middleware resolves.
    const [defaultOrg] = await getDb()
      .select({ id: organizations.id, timezone: organizations.timezone })
      .from(organizations)
      .where(
        and(
          eq(organizations.organizationType, "headquarters"),
          eq(organizations.status, "active"),
        ),
      )
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    expect(defaultOrg).toBeDefined();
    const tz = defaultOrg!.timezone ?? "America/New_York";

    const todayInTz = () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

    const cookie = await getAdminCookie();
    const before = todayInTz();
    const res = await apiFetch("/api/admin/activity-completions/today", {
      method: "GET",
      cookie,
    });
    const after = todayInTz();

    expect(res.status).toBe(200);
    const body = await res.json();
    // before/after bracket guards the (rare) midnight rollover between our
    // local computation and the server's.
    expect([before, after]).toContain(body.date);
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

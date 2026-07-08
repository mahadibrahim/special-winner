/**
 * GET /api/admin/labor/time-entries (Task 14,
 * docs/superpowers/plans/2026-07-07-time-tracking.md) — the admin review
 * surface flagged entries rely on. Self-seeds a venue + a handful of
 * time_entries rows (clean, flagged, and in/out of a date window) directly
 * via the DB, since there's no need to exercise the clock-in endpoint's
 * geofence logic here — that's covered by tests/api/staff/shifts.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getAdminCookie, getCoachCookie, apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/admin/labor/time-entries";

describe(ENDPOINT, () => {
  let adminCookie: string;
  let coachCookie: string;
  let venueId: string;
  let cleanEntryId: string;
  let flaggedEntryId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const ctx = await createAdminOrgGameContext();
    venueId = ctx.venueId;

    const db = getDb();
    const email = `labor-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword("TestLaborFixture123!");
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Labor", lastName: "Fixture", emailVerified: true })
      .returning();

    const [clean] = await db
      .insert(timeEntries)
      .values({
        organizationId: ctx.organizationId,
        userId: user.id,
        venueId,
        role: "coach",
        clockInAt: new Date("2026-06-03T14:00:00Z"),
        clockOutAt: new Date("2026-06-03T18:00:00Z"),
        clockInLat: "39.961200",
        clockInLng: "-82.998800",
        clockInAccuracyM: 10,
        flaggedOutOfRange: false,
      })
      .returning();
    cleanEntryId = clean.id;

    const [flagged] = await db
      .insert(timeEntries)
      .values({
        organizationId: ctx.organizationId,
        userId: user.id,
        venueId,
        role: "venue_manager",
        clockInAt: new Date("2026-06-04T14:00:00Z"),
        clockOutAt: new Date("2026-06-04T18:00:00Z"),
        clockInLat: "40.100000",
        clockInLng: "-82.998800",
        clockInAccuracyM: 30,
        clockInDistanceM: 400,
        flaggedOutOfRange: true,
        flagReason: "out_of_range",
      })
      .returning();
    flaggedEntryId = flagged.id;
  });

  it("401s without a session", async () => {
    const res = await apiFetch(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("403s a non-admin (coach)", async () => {
    const res = await apiFetch(ENDPOINT, { cookie: coachCookie });
    expect(res.status).toBe(403);
  });

  it("lists both fixture rows for an admin, most recent first", async () => {
    const res = await apiFetch(`${ENDPOINT}?venueId=${venueId}`, { cookie: adminCookie });
    const body = await expectJson(res, 200);
    const ids = body.timeEntries.map((t: { id: string }) => t.id);
    expect(ids).toContain(cleanEntryId);
    expect(ids).toContain(flaggedEntryId);
    const flaggedIdx = ids.indexOf(flaggedEntryId);
    const cleanIdx = ids.indexOf(cleanEntryId);
    expect(flaggedIdx).toBeLessThan(cleanIdx); // 2026-06-04 sorts before 2026-06-03 desc
  });

  it("flaggedOnly=1 surfaces only the flagged row, with flagReason populated", async () => {
    const res = await apiFetch(`${ENDPOINT}?venueId=${venueId}&flaggedOnly=1`, {
      cookie: adminCookie,
    });
    const body = await expectJson(res, 200);
    const ids = body.timeEntries.map((t: { id: string }) => t.id);
    expect(ids).toContain(flaggedEntryId);
    expect(ids).not.toContain(cleanEntryId);
    const row = body.timeEntries.find((t: { id: string }) => t.id === flaggedEntryId);
    expect(row.flagReason).toBe("out_of_range");
    expect(row.venueName).toBeTruthy();
    expect(row.userFirstName).toBe("Labor");
  });

  it("from/to filters to the requested window", async () => {
    const res = await apiFetch(
      `${ENDPOINT}?venueId=${venueId}&from=2026-06-03&to=2026-06-03`,
      { cookie: adminCookie },
    );
    const body = await expectJson(res, 200);
    const ids = body.timeEntries.map((t: { id: string }) => t.id);
    expect(ids).toContain(cleanEntryId);
    expect(ids).not.toContain(flaggedEntryId);
  });

  it("400s when only one of from/to is supplied", async () => {
    const res = await apiFetch(`${ENDPOINT}?from=2026-06-03`, { cookie: adminCookie });
    expect(res.status).toBe(400);
  });

  it("404s a venueId from another org", async () => {
    const res = await apiFetch(
      `${ENDPOINT}?venueId=00000000-0000-0000-0000-000000000000`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });
});

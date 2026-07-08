/**
 * POST /api/staff/shifts/clock-in, POST .../clock-out, GET .../current
 * (Tasks 8-10, docs/superpowers/plans/2026-07-07-time-tracking.md).
 *
 * Self-seeds a fresh coach user + a venue with known geofence coordinates
 * inside the resolved admin org ("aspire-sports"), per the CI-robustness
 * convention (deterministic find-or-create / fresh-fixture pattern used by
 * tests/api/staff/incidents.test.ts and
 * tests/api/referee/report-preserves-ejections.test.ts) rather than a
 * cached test account, so the "not yet consented" and "no open shift"
 * branches are always exercised from a clean state.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";

const PASSWORD = "TestShiftsCoach123!";
const VENUE_LAT = 39.9612;
const VENUE_LNG = -82.9988;
// ~170m north of the venue: outside the 150m default radius, but within
// accuracy 50's explainable range (matches the unit-test fixture numbers
// in tests/unit/time-tracking/geofence.test.ts).
const UNCERTAIN_LAT = VENUE_LAT + 0.00153;
// ~1.1km north: clearly outside, not accuracy-explainable at any
// trustworthy accuracy value.
const OUTSIDE_LAT = VENUE_LAT + 0.01;

async function createStaffFixture(): Promise<{
  cookie: string;
  organizationId: string;
  venueId: string;
}> {
  const ctx = await createAdminOrgGameContext();
  const db = getDb();

  await db
    .update(venues)
    .set({ latitude: VENUE_LAT.toFixed(6), longitude: VENUE_LNG.toFixed(6), radiusM: null })
    .where(eq(venues.id, ctx.venueId));

  const email = `shifts-coach-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, firstName: "Shifts", lastName: "Coach", emailVerified: true })
    .returning();

  const [coachRole] = await db.select().from(roles).where(eq(roles.name, "coach")).limit(1);
  if (!coachRole) throw new Error("e2e seed invariant violated: 'coach' role not found");
  await db.insert(userRoles).values({ userId: user.id, roleId: coachRole.id, scopeType: "global" });

  const cookie = await getAuthCookie(email, PASSWORD);
  return { cookie, organizationId: ctx.organizationId, venueId: ctx.venueId };
}

describe("POST /api/staff/shifts/clock-in, clock-out, current", () => {
  let cookie: string;
  let venueId: string;

  beforeAll(async () => {
    const fixture = await createStaffFixture();
    cookie = fixture.cookie;
    venueId = fixture.venueId;
  });

  it("401s without a session", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      method: "POST",
      body: JSON.stringify({ venueId }),
    });
    expect(res.status).toBe(401);
  });

  it("blocks clock-in with 409 consent_required before consent is acknowledged", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    const body = await expectJson(res, 409);
    expect(body.reason).toBe("consent_required");
  });

  it("404s clock-in for a venue outside the caller's org", async () => {
    await apiFetch("/api/staff/location-consent", {
      cookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({
        venueId: "00000000-0000-0000-0000-000000000000",
        lat: VENUE_LAT,
        lng: VENUE_LNG,
        accuracy: 10,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("blocks clock-in 422 missing_location when no coordinates are supplied", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId }),
    });
    const body = await expectJson(res, 422);
    expect(body.reason).toBe("missing_location");
  });

  it("blocks clock-in 422 imprecise_location when accuracy exceeds the trust cap", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 500 }),
    });
    const body = await expectJson(res, 422);
    expect(body.reason).toBe("imprecise_location");
  });

  it("blocks clock-in 422 out_of_range when clearly outside the venue", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: OUTSIDE_LAT, lng: VENUE_LNG, accuracy: 20 }),
    });
    const body = await expectJson(res, 422);
    expect(body.reason).toBe("out_of_range");
  });

  it("clocks in successfully when inside the venue radius, not flagged", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    const body = await expectJson(res, 201);
    expect(body.timeEntry.flaggedOutOfRange).toBe(false);
    expect(body.timeEntry.flagReason).toBeNull();
    expect(body.timeEntry.clockInAccuracyM).toBe(10);
    expect(body.timeEntry.venueId).toBe(venueId);
  });

  it("409s a second clock-in while a shift is already open", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    const body = await expectJson(res, 409);
    expect(body.reason).toBe("already_clocked_in");
  });

  it("GET current reflects the open shift", async () => {
    const res = await apiFetch("/api/staff/shifts/current", { cookie });
    const body = await expectJson(res, 200);
    expect(body.timeEntry).not.toBeNull();
    expect(body.timeEntry.venueId).toBe(venueId);
  });

  it("clocks out successfully and clears the open shift", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-out", {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 12 }),
    });
    const body = await expectJson(res, 200);
    expect(body.timeEntry.clockOutAt).toBeTruthy();
    expect(body.timeEntry.clockOutAccuracyM).toBe(12);

    const currentRes = await apiFetch("/api/staff/shifts/current", { cookie });
    const currentBody = await expectJson(currentRes, 200);
    expect(currentBody.timeEntry).toBeNull();
  });

  it("404s clock-out with no_open_shift when nothing is open", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-out", { cookie, method: "POST" });
    const body = await expectJson(res, 404);
    expect(body.reason).toBe("no_open_shift");
  });

  it("clocks in flagged (uncertain) when outside radius but within the fix's own accuracy", async () => {
    expect(
      haversineDistanceMeters(VENUE_LAT, VENUE_LNG, UNCERTAIN_LAT, VENUE_LNG),
    ).toBeGreaterThan(150);

    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie,
      method: "POST",
      body: JSON.stringify({ venueId, lat: UNCERTAIN_LAT, lng: VENUE_LNG, accuracy: 50 }),
    });
    const body = await expectJson(res, 201);
    expect(body.timeEntry.flaggedOutOfRange).toBe(true);
    expect(body.timeEntry.flagReason).toBe("out_of_range");

    // Clean up the open shift so this test file doesn't leak an open shift
    // across runs against the shared staging DB.
    await getDb().delete(timeEntries).where(eq(timeEntries.id, body.timeEntry.id));
  });
});

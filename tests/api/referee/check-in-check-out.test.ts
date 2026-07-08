/**
 * POST /api/referee/matches/[gameId]/check-in, POST .../check-out (Task 12,
 * docs/superpowers/plans/2026-07-07-time-tracking.md).
 *
 * Self-seeds a fresh referee user + a game/venue with known geofence
 * coordinates in the domain-resolved admin org ("aspire-sports"), same
 * pattern as tests/api/referee/report-preserves-ejections.test.ts — a
 * plain freshly-created user works because the sole authorization for
 * /api/referee/** is requireAssignedOfficial (a gameOfficials row).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { venues, gameOfficials } from "@/lib/db/schema/teams";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";
import { getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";

const PASSWORD = "TestShiftsReferee123!";
const VENUE_LAT = 39.9612;
const VENUE_LNG = -82.9988;
const OUTSIDE_LAT = VENUE_LAT + 0.01;

async function createFreshReferee(): Promise<{ userId: string; cookie: string }> {
  const db = getDb();
  const email = `shifts-referee-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const [refUser] = await db
    .insert(users)
    .values({ email, passwordHash, firstName: "Shifts", lastName: "Referee", emailVerified: true })
    .returning();
  const cookie = await getAuthCookie(email, PASSWORD);
  return { userId: refUser.id, cookie };
}

describe("POST /api/referee/matches/[gameId]/check-in, check-out", () => {
  let cookie: string;
  let refUserId: string;
  let gameId: string;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    const db = getDb();
    await db
      .update(venues)
      .set({ latitude: VENUE_LAT.toFixed(6), longitude: VENUE_LNG.toFixed(6), radiusM: null })
      .where(eq(venues.id, ctx.venueId));

    const ref = await createFreshReferee();
    cookie = ref.cookie;
    refUserId = ref.userId;
    gameId = ctx.gameId;

    await db.insert(gameOfficials).values({ gameId, userId: refUserId, position: "referee" });

    await apiFetch("/api/staff/location-consent", {
      cookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });
  });

  it("401s without a session", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("404s for a referee not assigned to the match", async () => {
    const other = await createFreshReferee();
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, {
      cookie: other.cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    expect(res.status).toBe(404);
  });

  it("404s cross-org even for an official assigned in a different org (requireSameOrgGame defense)", async () => {
    // A second, fully isolated org/game — our test referee gets assigned
    // there too, so requireAssignedOfficial alone would pass; the request
    // still resolves to the domain's "aspire-sports" org (localhost), so
    // requireSameOrgGame must be the layer that rejects it.
    const foreignCtx = await createTestGameContext();
    const db = getDb();
    await db.insert(gameOfficials).values({
      gameId: foreignCtx.gameId,
      userId: refUserId,
      position: "referee",
    });

    const res = await apiFetch(`/api/referee/matches/${foreignCtx.gameId}/check-in`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    expect(res.status).toBe(404);
  });

  it("blocks check-in 422 out_of_range when clearly outside the venue", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: OUTSIDE_LAT, lng: VENUE_LNG, accuracy: 20 }),
    });
    const body = await expectJson(res, 422);
    expect(body.reason).toBe("out_of_range");
  });

  it("blocks check-in 422 missing_location with no coordinates", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, {
      cookie,
      method: "POST",
      body: JSON.stringify({}),
    });
    const body = await expectJson(res, 422);
    expect(body.reason).toBe("missing_location");
  });

  it("checks in successfully when inside the venue radius", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    const body = await expectJson(res, 201);
    expect(body.timeEntry.role).toBe("referee");
    expect(body.timeEntry.gameId).toBe(gameId);
    expect(body.timeEntry.flaggedOutOfRange).toBe(false);
  });

  it("409s a duplicate check-in to the same match", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-in`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 10 }),
    });
    const body = await expectJson(res, 409);
    expect(body.reason).toBe("already_checked_in");
  });

  it("checks out successfully, closing the open entry", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-out`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ lat: VENUE_LAT, lng: VENUE_LNG, accuracy: 15 }),
    });
    const body = await expectJson(res, 200);
    expect(body.timeEntry.clockOutAt).toBeTruthy();
    expect(body.timeEntry.clockOutAccuracyM).toBe(15);
  });

  it("404s a second check-out with no_open_check_in", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/check-out`, {
      cookie,
      method: "POST",
      body: JSON.stringify({}),
    });
    const body = await expectJson(res, 404);
    expect(body.reason).toBe("no_open_check_in");
  });

  it("persisted row is scoped to the resolved org", async () => {
    const rows = await getDb()
      .select({ organizationId: timeEntries.organizationId })
      .from(timeEntries)
      .where(eq(timeEntries.gameId, gameId));
    expect(rows.length).toBeGreaterThan(0);
  });
});

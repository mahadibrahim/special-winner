/**
 * Held pay-link walk-in bookings (status `pending_claim`) must be visible
 * across the venue backend, not just invisible-until-paid:
 *   - GET /api/admin/check-in/event includes pending_claim rows with `status`.
 *   - GET /api/admin/venue-day/[date] reports a real `capacityCurrent` for
 *     drop-in blocks that counts confirmed + pending_claim bookings.
 *   - POST /api/admin/venue/cancel-hold lets the desk release a hold early,
 *     is tenant-scoped (cross-org admin gets 404), and refuses to touch a
 *     confirmed booking (409).
 *
 * Fixture: real pending_claim bookings are created the same way a kiosk
 * pay-link hold is created in production — via
 * POST /api/kiosk/{locationId}/walkin/start — against a drop-in session
 * seeded for TODAY at the E2E rental venue (mirrors
 * tests/api/kiosk/walkin.test.ts and tests/api/booking-search.test.ts).
 *
 * The tenant-scoping test needs a *second* held booking that belongs to a
 * DIFFERENT org. Org B's fixture ids are resolved via the test-only
 * GET /api/test/org-fixtures?slug=orgb endpoint (same pattern as
 * tests/api/admin-tenant-scoping.test.ts) and a second pending_claim
 * booking is created there via the same kiosk walk-in flow — the kiosk
 * resolves its org from the location segment directly, not from the
 * request host, so this works over the same localhost base URL used by
 * `admin@test.aspiresports.com` (Org A / HQ).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function startWalkin(
  locationId: string,
  sessionId: string,
  emailSuffix: string,
): Promise<string> {
  const res = await apiFetch(`/api/kiosk/${locationId}/walkin/start`, {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      contact: {
        firstName: "Held",
        lastName: "Booking",
        email: `hold-visibility-${emailSuffix}-${UNIQUE_SUFFIX}@walkin-test.invalid`,
        phone: "6145550101",
        dob: "1990-01-01",
      },
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.bookingId as string;
}

describe("Venue hold visibility (pending_claim pay-link holds)", () => {
  let adminCookie: string;
  let locationId: string;
  let sessionId: string;
  let dateStr: string;
  let heldBookingId: string;
  // Belongs to Org B — used only by the tenant-scoping test.
  let heldBookingIdOrgB: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const db = getDb();

    await db
      .insert(dropInRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();

    const [rentalVenue] = await db
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
      .limit(1);
    if (!rentalVenue) {
      throw new Error(
        "E2E rental venue not seeded — run `npm run db:seed:e2e` first.",
      );
    }
    locationId = rentalVenue.locationId;

    // Seed a walk-in-eligible drop-in session for TODAY (UTC), same pattern
    // as tests/api/kiosk/walkin.test.ts.
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    dateStr = todayStart.toISOString().slice(0, 10);
    const sessionStart = new Date(todayStart.getTime() + 3 * 3_600_000);
    const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `hold-visibility-test-${UNIQUE_SUFFIX}`,
        startsAt: sessionStart,
        endsAt: sessionEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["red", "blue"],
        sessionRateCents: 1200,
        walkUpRateCents: 1900,
      })
      .returning();
    sessionId = session.id;

    // Held booking exercised by the roster/capacity tests, then cancelled.
    heldBookingId = await startWalkin(locationId, sessionId, "1");

    // ---- Org B fixture: a second held booking under a DIFFERENT org ----
    const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
      method: "GET",
    });
    if (orgBFixtureRes.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const orgBFixtures = await orgBFixtureRes.json();

    await db
      .insert(dropInRateCard)
      .values({ organizationId: orgBFixtures.org.id })
      .onConflictDoNothing();

    const orgBSessionStart = new Date(todayStart.getTime() + 5 * 3_600_000);
    const orgBSessionEnd = new Date(orgBSessionStart.getTime() + 90 * 60_000);
    const [orgBSession] = await db
      .insert(dropInSessions)
      .values({
        organizationId: orgBFixtures.org.id,
        venueId: orgBFixtures.venueId,
        kind: "pickup",
        sportOrClassLabel: `hold-visibility-orgb-${UNIQUE_SUFFIX}`,
        startsAt: orgBSessionStart,
        endsAt: orgBSessionEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["red", "blue"],
        sessionRateCents: 1200,
        walkUpRateCents: 1900,
      })
      .returning();

    heldBookingIdOrgB = await startWalkin(
      orgBFixtures.locationId,
      orgBSession.id,
      "orgb",
    );
  });

  it("includes pending_claim rows with status in the event roster", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const held = body.rows.find((r: any) => r.targetId === heldBookingId);
    expect(held).toBeDefined();
    expect(held.status).toBe("pending_claim");
  });

  it("reports a real capacityCurrent for the drop-in block (confirmed + pending_claim)", async () => {
    const res = await apiFetch(
      `/api/admin/venue-day/${dateStr}?locationId=${locationId}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const block = (body.blocks as any[]).find((b) => b.id === sessionId);
    expect(block).toBeDefined();
    // The one held booking occupies the session; no others were created here.
    expect(block.capacityCurrent).toBe(1);
  });

  it("cancel-hold is tenant-scoped (cross-org booking id gets 404)", async () => {
    // admin@test.aspiresports.com is authorized for Org A (the localhost
    // context); heldBookingIdOrgB belongs to Org B. The endpoint must not
    // leak existence of a cross-tenant booking — 404, not 403/409.
    const res = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ bookingId: heldBookingIdOrgB }),
    });
    expect(res.status).toBe(404);

    // Untouched — still pending_claim.
    const [row] = await getDb()
      .select({ status: dropInBookings.status })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, heldBookingIdOrgB))
      .limit(1);
    expect(row.status).toBe("pending_claim");
  });

  it("cancel-hold cancels a pending booking and refuses a confirmed one", async () => {
    const ok = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ bookingId: heldBookingId }),
    });
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.ok).toBe(true);

    const again = await apiFetch(
      `/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`,
      { cookie: adminCookie },
    );
    const rows = (await again.json()).rows;
    expect(rows.find((r: any) => r.targetId === heldBookingId)).toBeUndefined();

    // Confirm a cancelled booking can't be cancelled again (409, not 200).
    const again2 = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ bookingId: heldBookingId }),
    });
    expect(again2.status).toBe(409);

  });

  it("refuses a confirmed booking (409, not 200)", async () => {
    // Own-org booking this time (Org B's heldBookingIdOrgB would 404 before
    // ever reaching the status check — this proves the 409 path on a
    // booking the caller actually owns).
    const db = getDb();
    const [u] = await db
      .insert(users)
      .values({
        email: `hold-visibility-confirmed-${UNIQUE_SUFFIX}@t.example`,
        firstName: "Confirmed",
        lastName: "Booking",
      })
      .returning();
    const [confirmedBooking] = await db
      .insert(dropInBookings)
      .values({
        sessionId,
        userId: u.id,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 1200,
      })
      .returning();

    const refused = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ bookingId: confirmedBooking.id }),
    });
    expect(refused.status).toBe(409);
  });

  it("returns 400 when bookingId is missing", async () => {
    const res = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await apiFetch("/api/admin/venue/cancel-hold", {
      method: "POST",
      body: JSON.stringify({ bookingId: heldBookingId }),
    });
    expect([401, 403]).toContain(res.status);
  });
});

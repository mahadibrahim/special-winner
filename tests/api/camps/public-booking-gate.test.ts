/**
 * Final-review finding I-1 of the 2026-09-06-camps-phase4 plan: camp
 * day-sessions are REGISTRATION-ONLY and must be gated out of every
 * public/walk-in booking surface. Before the fix, a materialized kind='camp'
 * session (sessionRateCents null) listed on the lobby kiosk and fell into
 * the class-vs-everything-else split on walkin/start, POST
 * /api/dropin/bookings, /api/dropin/guest-checkout and the public session
 * detail — pricing a week-long youth camp off the ADULT PICKUP rate card
 * (~$15 walk-up instead of the ~$300 registration).
 *
 * This suite pins all the doors:
 *   - GET  /api/kiosk/[loc]/sessions       → camp excluded, pickup still listed
 *   - POST /api/kiosk/[loc]/walkin/start   → 422 camp_registration_only
 *   - POST /api/dropin/bookings            → 422 camp_registration_only
 *   - POST /api/dropin/guest-checkout      → 422 camp_registration_only
 *   - GET  /api/dropin/sessions/[id]       → 200 (an auto-enrolled parent
 *     reaches the page from the dashboard drop-in panel's Details / Sign
 *     waiver links) but with BOTH quote fields null — no priced CTA, and
 *     the POST gates above are the authority if a submit is forced anyway.
 *
 * Fixture pattern mirrors tests/api/camps/venue-day-camp.test.ts: direct
 * inserts, afterAll cleanup, everything anchored to `new Date()` (never a
 * fixed calendar date). A pickup control session shares the venue so the
 * kiosk assertion proves the filter EXCLUDES camp without over-excluding.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { locations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { apiFetch, getParentCookie } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { assertTestDatabase } from "../../utils/assert-test-database";

const suffix = Math.random().toString(36).slice(2, 10);

let organizationId: string;
let locationId: string;
let venueId: string;
let campSessionId: string;
let pickupSessionId: string;

beforeAll(async () => {
  assertTestDatabase();
  const db = getDb();

  const orgCtx = await resolveDefaultOrgForHttpTests();
  organizationId = orgCtx.organizationId;

  // The org must HAVE a rate card, so the session-detail assertion below
  // proves the camp gate nulls the quote — not a missing rate card.
  await db
    .insert(dropInRateCard)
    .values({ organizationId })
    .onConflictDoNothing();

  const [location] = await db
    .insert(locations)
    .values({
      name: `Camp Gate Loc ${suffix}`,
      slug: `camp-gate-loc-${suffix}`,
      organizationId,
    })
    .returning();
  locationId = location.id;

  const [venue] = await db
    .insert(venues)
    .values({ name: `Camp Gate Venue ${suffix}`, locationId })
    .returning();
  venueId = venue.id;

  // Both sessions START now and run 4h — trivially inside the facility's
  // local "today" (startsAt == now) and not yet ended, whatever the time of
  // day the suite runs. No fixed-hour lottery.
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);

  const [campSession] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "camp",
      sportOrClassLabel: `Summer Camp Gate ${suffix}`,
      startsAt,
      endsAt,
      capacity: 20,
      audience: "youth",
      status: "scheduled",
    })
    .returning();
  campSessionId = campSession.id;

  const [pickupSession] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "pickup",
      sportOrClassLabel: `Pickup Gate Control ${suffix}`,
      startsAt,
      endsAt,
      capacity: 20,
      status: "scheduled",
    })
    .returning();
  pickupSessionId = pickupSession.id;
});

afterAll(async () => {
  const db = getDb();
  const sessionIds = [campSessionId, pickupSessionId].filter(Boolean);
  if (sessionIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, sessionIds));
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, sessionIds));
  }
  if (venueId) await db.delete(venues).where(eq(venues.id, venueId));
  if (locationId) await db.delete(locations).where(eq(locations.id, locationId));
});

describe("camp day-sessions are registration-only on every public booking door (I-1)", () => {
  it("GET /api/kiosk/[loc]/sessions excludes the camp session but still lists pickup", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(pickupSessionId); // filter must not over-exclude
    expect(ids).not.toContain(campSessionId);
  });

  it("POST /api/kiosk/[loc]/walkin/start refuses a camp session before rate resolution", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/walkin/start`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: campSessionId,
        contact: {
          firstName: "Walkup",
          lastName: `CampGate${suffix}`,
          email: `camp-gate-walkin-${suffix}@test.invalid`,
          dob: "1990-01-15", // adult — the pre-fix path that priced off the pickup card
        },
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("camp_registration_only");
    // No hold/booking row was written for the refused sale.
    const db = getDb();
    const bookings = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, campSessionId));
    expect(bookings).toHaveLength(0);
  });

  it("POST /api/dropin/bookings refuses a camp session for an authed user", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: campSessionId }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error?.code).toBe("camp_registration_only");
  });

  it("POST /api/dropin/guest-checkout refuses a camp session for a guest", async () => {
    const res = await apiFetch("/api/dropin/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: campSessionId,
        firstName: "Guest",
        lastName: `CampGate${suffix}`,
        email: `camp-gate-guest-${suffix}@test.invalid`,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error?.code).toBe("camp_registration_only");
  });

  it("GET /api/dropin/sessions/[id] returns the camp session with NO price quote (non-bookable, not 404)", async () => {
    const res = await apiFetch(`/api/dropin/sessions/${campSessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.kind).toBe("camp");
    // Both quote fields null → BookButton renders no priced CTA and any
    // forced submit lands on the POST gates pinned above. The org HAS a
    // rate card (seeded in beforeAll), so null here proves the camp gate.
    expect(body.resolvedAmountCents).toBeNull();
    expect(body.resolvedPaymentMethod).toBeNull();
  });

  it("control: the pickup session detail still quotes a price off the rate card", async () => {
    const res = await apiFetch(`/api/dropin/sessions/${pickupSessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.kind).toBe("pickup");
    expect(typeof body.resolvedAmountCents).toBe("number");
    expect(body.resolvedPaymentMethod).not.toBeNull();
  });
});

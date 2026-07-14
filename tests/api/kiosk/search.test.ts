/**
 * GET /api/kiosk/[locationSlug]/search
 *
 * The kiosk is facility (location) scoped. Seeds a drop-in session TODAY
 * (bounded by the facility's *local* timezone — see dayBoundsInTz) at the
 * E2E rental venue (a space in the seeded facility) and a confirmed
 * booking for the seed parent user. Verifies:
 *   - a name query returns nothing (privacy fix — phone-only matching)
 *   - last-4-of-phone match → returns the booking, with an abbreviated title
 *   - empty / short / sub-4-digit query → returns empty results
 *   - unknown location segment → 404
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { eq } from "drizzle-orm";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
  TEST_USERS,
} from "@/lib/db/seeds/seed-e2e-tests";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

// Use a unique field so parallel runs at the same venue don't collide on
// the booking unique index (session_id, user_id). The session is placed at
// local noon at the facility's timezone (see beforeAll), which is
// unambiguously inside the facility's local "today" regardless of what
// hour/DST-state the test happens to run in.
const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("GET /api/kiosk/[locationSlug]/search", () => {
  let parentUserId: string;
  let parentPhone: string;
  let parentFirstName: string;
  let sessionId: string;
  let bookingId: string;
  // The kiosk is facility-scoped — kiosk URLs use the location segment.
  let locationId: string;

  beforeAll(async () => {
    const db = getDb();

    // Resolve the facility (location) the rental venue belongs to — the
    // kiosk resolves a location, so the search URLs use this segment.
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

    // Resolve the facility's timezone — the endpoint bounds "today" by the
    // facility's *local* day (dayBoundsInTz), not naive UTC. The seeded
    // session below must land inside that local day regardless of what
    // wall-clock hour this test happens to run at.
    const [locationRow] = await db
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    const tz = locationRow?.timezone ?? "America/New_York";

    // Resolve the seed parent user (must exist from seed-e2e-tests run).
    const [parentRow] = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, phone: users.phone })
      .from(users)
      .where(eq(users.email, TEST_USERS.parent.email))
      .limit(1);
    if (!parentRow) {
      throw new Error("Seed parent user not found — run npm run db:seed:e2e first");
    }
    parentUserId = parentRow.id;
    parentFirstName = parentRow.firstName ?? TEST_USERS.parent.firstName;

    // Ensure the parent has a phone so last-4 matching is testable.
    // If the seed didn't set one, give it a stable value for this run.
    if (!parentRow.phone) {
      const testPhone = `5550${UNIQUE_SUFFIX.replace(/\D/g, "").slice(0, 6)}`.slice(0, 10).padEnd(10, "0");
      await db
        .update(users)
        .set({ phone: testPhone })
        .where(eq(users.id, parentUserId));
      parentPhone = testPhone;
    } else {
      parentPhone = parentRow.phone;
    }

    // Ensure a rate card exists for the org.
    await db
      .insert(dropInRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();

    // Place the session at the facility's local noon today — the midpoint
    // of dayBoundsInTz's [start, end) window — so it's unambiguously inside
    // the facility's local "today" no matter what hour/DST-state this test
    // runs at.
    const { start: localDayStart, end: localDayEnd } = dayBoundsInTz(tz);
    const sessionStart = new Date(
      (localDayStart.getTime() + localDayEnd.getTime()) / 2,
    );
    const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `kiosk-search-test-${UNIQUE_SUFFIX}`,
        startsAt: sessionStart,
        endsAt: sessionEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["orange", "black"],
      })
      .returning();
    sessionId = session.id;

    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId,
        userId: parentUserId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
      })
      .returning();
    bookingId = booking.id;
  });

  // Covers the 4-digit gate: a pure-name query has zero digits, so
  // qDigits.length < 4 trips the early return before any DB query runs.
  // This only proves the gate itself works — it does NOT exercise the query
  // builder, so it would still pass even if a name-matching disjunct were
  // reintroduced there. See "rejects a name that rides along with a
  // non-matching phone suffix" below for the test that actually guards
  // against that regression.
  it("returns nothing for a name query", async () => {
    // Use at least the first 2 chars of the parent's first name — this used
    // to be enough to surface the booking; it must not be anymore.
    const q = parentFirstName.slice(0, Math.max(2, Math.floor(parentFirstName.length / 2)));
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(q)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  // The actual regression guard for the privacy fix. A pure-name query (see
  // above) never reaches the query builder at all — it's caught by the
  // qDigits.length < 4 gate first, so it can't detect a name disjunct
  // reintroduced *inside* the query. This probe appends 4 digits that are
  // deliberately NOT the seeded booking's phone suffix, so qDigits.length
  // is 4 and execution clears the gate and reaches db.select(...). The
  // phone-suffix filter then correctly finds no match. But the probe also
  // contains the seeded user's real first name — if anyone ever adds back
  // an `ilike(users.firstName, ...)` (or similar) disjunct to the query,
  // that name would match and this test would start seeing a result,
  // failing the `toEqual([])` assertion below.
  it("rejects a name that rides along with a non-matching phone suffix", async () => {
    const realLast4 = parentPhone.replace(/\D/g, "").slice(-4);
    // +1 mod 10000 is always different from realLast4 (equal would require
    // 1 ≡ 0 mod 10000), and is derived rather than hardcoded so it can't
    // silently collide with whatever the seed data happens to be.
    const nonMatchingLast4 = String(
      (parseInt(realLast4, 10) + 1) % 10000,
    ).padStart(4, "0");
    const q = `${parentFirstName}${nonMatchingLast4}`;
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(q)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns nothing for fewer than 4 digits", async () => {
    const last4 = parentPhone.replace(/\D/g, "").slice(-4);
    const q = last4.slice(0, 3);
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(q)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns the booking when searching by last-4 of phone", async () => {
    const last4 = parentPhone.replace(/\D/g, "").slice(-4);
    if (!last4 || last4.length < 4) {
      // If phone is too short (shouldn't happen), skip gracefully.
      return;
    }
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(last4)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    const match = body.results.find((r: { targetId: string }) => r.targetId === bookingId);
    expect(match).toBeDefined();
    expect(match.kind).toBe("drop_in_booking");
  });

  it("abbreviates the surname so a digit collision reveals little", async () => {
    const last4 = parentPhone.replace(/\D/g, "").slice(-4);
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(last4)}`,
    );
    const body = await res.json();
    const match = body.results.find((r: { targetId: string }) => r.targetId === bookingId);
    expect(match).toBeDefined();
    // "Casey Tester" -> "Casey T."
    expect(match.title).toMatch(/^\S+ \S\.$/);
  });

  it("returns empty results for an empty query", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/search?q=`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns empty results for a single-char query (below threshold)", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/search?q=A`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns 404 for a non-UUID location segment", async () => {
    const res = await apiFetch(`/api/kiosk/not-a-uuid/search?q=test`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a well-formed UUID that doesn't exist", async () => {
    const res = await apiFetch(
      `/api/kiosk/00000000-0000-0000-0000-000000000000/search?q=test`,
    );
    expect(res.status).toBe(404);
  });

  // Fixture cleanup: this session is seeded for TODAY at the shared staging
  // DB. The day board (venue-day-data.ts) has no status filter on sessions,
  // so a merely-cancelled session would still show up — cancel (releases
  // the confirmed booking created above) then hard-delete it so it doesn't
  // linger on the roster for the e2e activity-roster test to trip over.
  // Best-effort: a failure here shouldn't fail the suite.
  afterAll(async () => {
    if (!sessionId) return;
    const adminCookie = await getAdminCookie().catch(() => null);
    if (!adminCookie) return;
    await apiFetch(`/api/admin/dropin/sessions/${sessionId}/cancel`, {
      method: "POST",
      cookie: adminCookie,
    }).catch(() => null);
    await apiFetch(`/api/admin/dropin/sessions/${sessionId}`, {
      method: "DELETE",
      cookie: adminCookie,
    }).catch(() => null);
  });
});

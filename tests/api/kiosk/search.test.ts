/**
 * GET /api/kiosk/[locationSlug]/search
 *
 * The kiosk is facility (location) scoped. Seeds a drop-in session TODAY
 * at the E2E rental venue (a space in the seeded facility) and a confirmed
 * booking for the seed parent user. Verifies:
 *   - partial name match → returns the booking
 *   - last-4-of-phone match → returns the booking
 *   - empty / short query → returns empty results
 *   - unknown location segment → 404
 */
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { eq } from "drizzle-orm";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
  TEST_USERS,
} from "@/lib/db/seeds/seed-e2e-tests";

// Use a unique field so parallel runs at the same venue don't collide on
// the booking unique index (session_id, user_id). The session is scoped to
// today UTC, so it IS today-bounded, which is exactly what the search
// endpoint requires.
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

    // Build today-UTC bounds for startsAt.
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // Place the session 1 hour after UTC midnight so it's firmly within today.
    const sessionStart = new Date(todayStart.getTime() + 1 * 3_600_000);
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

  it("returns the booking when searching by partial first name", async () => {
    // Use at least the first 2 chars of the parent's first name.
    const q = parentFirstName.slice(0, Math.max(2, Math.floor(parentFirstName.length / 2)));
    const res = await apiFetch(
      `/api/kiosk/${locationId}/search?q=${encodeURIComponent(q)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    const match = body.results.find((r: { targetId: string }) => r.targetId === bookingId);
    expect(match).toBeDefined();
    expect(match.kind).toBe("drop_in_booking");
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
});

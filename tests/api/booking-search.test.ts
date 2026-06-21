/**
 * GET /api/admin/booking-search?q=<name|phone>
 *
 * Admin-gated. Seeds a drop-in session TODAY at the E2E rental venue with a
 * confirmed booking for the seed parent user. Verifies:
 *   - 401 without auth
 *   - 200 + results array with admin auth
 *   - matching booking is found by name
 *   - empty / short query returns empty results
 */
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";
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

const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("GET /api/admin/booking-search", () => {
  let adminCookie: string;
  let parentFirstName: string;
  let bookingId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const db = getDb();

    // Verify the rental venue is seeded.
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

    // Resolve the seed parent user.
    const [parentRow] = await db
      .select({ id: users.id, firstName: users.firstName })
      .from(users)
      .where(eq(users.email, TEST_USERS.parent.email))
      .limit(1);
    if (!parentRow) {
      throw new Error("Seed parent user not found — run npm run db:seed:e2e first");
    }
    parentFirstName = parentRow.firstName ?? TEST_USERS.parent.firstName;

    // Ensure a rate card exists.
    await db
      .insert(dropInRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();

    // Create a drop-in session for today UTC.
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const sessionStart = new Date(todayStart.getTime() + 2 * 3_600_000);
    const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `booking-search-test-${UNIQUE_SUFFIX}`,
        startsAt: sessionStart,
        endsAt: sessionEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["blue", "red"],
      })
      .returning();

    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: session.id,
        userId: parentRow.id,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
      })
      .returning();
    bookingId = booking.id;
  });

  it("returns 401 without auth", async () => {
    const res = await apiFetch("/api/admin/booking-search?q=test");
    expect(res.status).toBe(401);
  });

  it("returns 200 with results array when authenticated as admin", async () => {
    const res = await apiFetch("/api/admin/booking-search?q=test", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("returns the seeded booking when searching by partial name", async () => {
    const q = parentFirstName.slice(0, Math.max(2, Math.floor(parentFirstName.length / 2)));
    const res = await apiFetch(
      `/api/admin/booking-search?q=${encodeURIComponent(q)}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    const match = body.results.find((r: { targetId: string }) => r.targetId === bookingId);
    expect(match).toBeDefined();
    expect(match.kind).toBe("drop_in_booking");
    expect(typeof match.timeLabel).toBe("string");
    expect(match.timeLabel.length).toBeGreaterThan(0);
    expect(typeof match.waiverSigned).toBe("boolean");
    expect(typeof match.checkedIn).toBe("boolean");
  });

  it("returns empty results for an empty query", async () => {
    const res = await apiFetch("/api/admin/booking-search?q=", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns empty results for a single-char query (below threshold)", async () => {
    const res = await apiFetch("/api/admin/booking-search?q=A", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });
});

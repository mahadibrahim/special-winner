import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  getParentCookie,
  getAuthCookie,
  apiFetch,
} from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { consents } from "@/lib/db/schema/consents";
import { hashPassword } from "@/lib/auth";
import { WAIVER_ON_FILE_ATTRIBUTION, WAIVER_VALID_DAYS } from "@/lib/consents/liability";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// A distinct calendar DAY per test run, far in the future, at a fixed
// within-window hour. Date.now() spread across millions of distinct days
// means consecutive runs (even seconds apart) never reuse a slot.
// Per-run base date, kept inside the 4-digit-year range so toISOString()
// doesn't produce a `+`-prefixed extended-year string that pg rejects.
// 10 years × 365 days = ~3650 distinct days; with 3 fields × multiple
// hours per run that's enormous slot space — collision-free in practice.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const DAY_MS = 86_400_000;
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * DAY_MS;

/**
 * Build a slot inside the venue rental window (8am-10pm UTC). `hourOfDay`
 * stays between 9 and 19 so a 1-2h booking ends by 21:00.
 */
function slot(hourOfDay: number, durationHours: number) {
  const start = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: 1,
    ...slot(9, 1),
    partySize: 4,
    purpose: "scrimmage",
    waiverAccepted: true,
    waiverName: "Test Parent",
    ...overrides,
  };
}

describe("POST /api/rentals/bookings", () => {
  it("guest (no auth) can request with contact info", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validBody({
          fieldNumber: 1,
          ...slot(12, 1),
          renterName: "Guest Gal",
          renterEmail: `guest_${Date.now()}@test.aspiresports.com`,
        }),
      ),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).requested).toBe(true);
  });

  it("returns 422 when waiverAccepted is false", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        validBody({ waiverAccepted: false }),
      ),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // Under E2E_TEST_ENDPOINTS=yes (the flag the dev server runs with here) the
  // min-lead-time guard is skipped along with the near/far-window checks, so
  // these far-future slots go straight to `requested: true`. The guard's
  // 422 path is unit-tested separately, not over HTTP against a shared slot
  // space.
  it("returns 200 with requested:true for a valid booking request", async () => {
    const cookie = await getParentCookie();
    // Use a distinct slot (field 1, hour 14) so it doesn't collide with
    // conflict.test.ts which uses field 2 at hours 10-13.
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...slot(14, 2) })),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requested).toBe(true);
    expect(typeof body.rentalId).toBe("string");
    expect(body).not.toHaveProperty("checkoutUrl");
  });

  it("holds the slot — a second request for the same slot conflicts", async () => {
    const cookie = await getParentCookie();
    const s = slot(16, 1);
    const first = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(first.status).toBe(200);
    const second = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(second.status).toBe(409);
  });
});

describe("GET /api/rentals/bookings", () => {
  let parentCookie: string;

  beforeAll(async () => {
    parentCookie = await getParentCookie();
  });

  it("returns 200 with rentals array for authenticated user", async () => {
    const res = await apiFetch("/api/rentals/bookings", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rentals)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });
});

/**
 * ANNUAL LIABILITY WAIVER on the online rental booking door.
 *
 * Each test uses a FRESH, dedicated account (never the shared parent test
 * user) — the annual waiver is a real, persistent grant, and a shared
 * account's coverage state would otherwise leak across this file's other
 * tests (and other rentals suites that also use getParentCookie()).
 */
describe("POST /api/rentals/bookings — annual waiver on file", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const PASSWORD = "RentalWaiver123!";

  const createdUserIds: string[] = [];
  const createdFamilyMemberIds: string[] = [];

  async function makeRenter(label: string): Promise<{ userId: string; cookie: string }> {
    const email = `rental-waiver-${label}-${SUFFIX}@test.aspiresports.com`;
    const [user] = await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword(PASSWORD),
        firstName: "Rental",
        lastName: `Waiver${label}`,
        emailVerified: true,
      })
      .returning();
    createdUserIds.push(user.id);
    const cookie = await getAuthCookie(email, PASSWORD);
    return { userId: user.id, cookie };
  }

  /** Direct family_members + consents insert — the shape a real annual
   *  signature produces, independent of the endpoint under test. */
  async function giveValidWaiver(userId: string): Promise<string> {
    const [person] = await getDb()
      .insert(familyMembers)
      .values({ selfUserId: userId, firstName: "Rental", lastName: "Waiver" })
      .returning();
    createdFamilyMemberIds.push(person.id);
    const signedAt = new Date();
    await getDb()
      .insert(consents)
      .values({
        familyMemberId: person.id,
        organizationId: E2E_ORG_ID,
        type: "liability",
        status: "granted",
        signedByUserId: userId,
        signedByName: "Rental Waiver",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
      });
    return person.id;
  }

  afterAll(async () => {
    const db = getDb();
    if (createdFamilyMemberIds.length) {
      await db
        .delete(consents)
        .where(inArray(consents.familyMemberId, createdFamilyMemberIds));
    }
    if (createdUserIds.length) {
      await db
        .delete(fieldRentals)
        .where(inArray(fieldRentals.renterUserId, createdUserIds));
    }
    if (createdFamilyMemberIds.length) {
      await db
        .delete(familyMembers)
        .where(inArray(familyMembers.id, createdFamilyMemberIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it("(a) covered renter books WITHOUT waiverAccepted/waiverName → 200, row stamped on-file", async () => {
    const { userId, cookie } = await makeRenter("a");
    await giveValidWaiver(userId);

    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 90,
        ...slot(10, 1),
        partySize: 2,
        purpose: "practice",
        // waiverAccepted / waiverName deliberately omitted.
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.requested).toBe(true);

    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, body.rentalId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // Load-bearing: a dated derived row would self-renew the legacy fallback.
    expect(row.waiverSignedAt).toBeNull();
  });

  it("(b) renter with no valid waiver, no waiver fields → 422 exactly as today", async () => {
    const { cookie } = await makeRenter("b");

    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 91,
        ...slot(10, 1),
        partySize: 2,
        purpose: "practice",
        // No waiverAccepted/waiverName, and nothing on file for this brand
        // new account — the validator must still ask.
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("waiver must be accepted to book");
  });

  it("(c) a fresh signature at booking writes an org-scoped consents row with the request's ip/UA", async () => {
    const { userId, cookie } = await makeRenter("c");

    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      headers: { "User-Agent": "annual-waiver-rentals-test/1.0" },
      body: JSON.stringify({
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 92,
        ...slot(10, 1),
        partySize: 2,
        purpose: "practice",
        waiverAccepted: true,
        waiverName: "Rental Waiver C",
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, body.rentalId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Rental Waiver C");
    // A REAL signature is dated — only derived on-file copies are not.
    expect(row.waiverSignedAt).not.toBeNull();

    const [person] = await getDb()
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, userId));
    expect(person).toBeTruthy();
    createdFamilyMemberIds.push(person.id);

    const rows = await getDb()
      .select()
      .from(consents)
      .where(
        and(eq(consents.familyMemberId, person.id), eq(consents.type, "liability")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(E2E_ORG_ID);
    expect(rows[0].signedByUserId).toBe(userId);
    expect(rows[0].signedByName).toBe("Rental Waiver C");
    expect(rows[0].status).toBe("granted");
    expect(rows[0].expiresAt).not.toBeNull();
    // ip/UA come from THIS request's context, never the body.
    expect(rows[0].userAgent).toBe("annual-waiver-rentals-test/1.0");
  });

  it("explicit waiverAccepted:false is still rejected even when the renter is covered", async () => {
    // A covered renter isn't shown the checkbox at all in a real client —
    // an explicit `false` is a signal the box WAS shown and unchecked, and
    // must not be silently overridden by server-side coverage.
    const { userId, cookie } = await makeRenter("false-explicit");
    await giveValidWaiver(userId);

    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 93,
        ...slot(10, 1),
        partySize: 2,
        purpose: "practice",
        waiverAccepted: false,
      }),
    });
    expect(res.status).toBe(422);
  });
});

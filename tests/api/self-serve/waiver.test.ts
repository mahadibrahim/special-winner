import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { consents } from "@/lib/db/schema/consents";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { venues } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { mintToken } from "@/lib/check-in/tokens-db";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { and, eq, inArray } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** Wall clock at module load — lets "this run wrote nothing" assertions
 *  ignore rows the shared staging DB kept from earlier runs. */
const SUITE_START = new Date();

// Unique slot per run to avoid collisions.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/self-serve/[token]/waiver", () => {
  let rentalId: string;
  let tokenValue: string;

  beforeAll(async () => {
    // Seed a field_rental without waiver signed.
    const start = new Date(RUN_BASE_UTC + 12 * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 51,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Waiver Test Renter",
        renterEmail: "waiver-test@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
        waiverSigned: false,
      })
      .returning();
    rentalId = rental.id;

    // Mint a token.
    const tok = await mintToken({
      kind: "field_rental",
      targetId: rentalId,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: null,
      recipientEmail: "waiver-test@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    tokenValue = tok.token;
  });

  it("returns 200 and marks waiver signed on the rental row", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Test Renter" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
    expect(typeof body.waiverSignedAt).toBe("string");

    // Verify DB was actually updated.
    const [row] = await getDb()
      .select({
        waiverSigned: fieldRentals.waiverSigned,
        waiverSignedBy: fieldRentals.waiverSignedBy,
        waiverSignedAt: fieldRentals.waiverSignedAt,
        waiverConsentVariant: fieldRentals.waiverConsentVariant,
        waiverConsentText: fieldRentals.waiverConsentText,
      })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .limit(1);

    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Test Renter");
    expect(row.waiverSignedAt).not.toBeNull();
    // #398: the record proves which consent language was shown. A rental
    // renter signs for themselves — adult variant, adult sentence.
    expect(row.waiverConsentVariant).toBe("adult");
    expect(row.waiverConsentText).toBe("I have read and accept these terms.");
  });

  it("returns 422 when acceptedName is empty", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "  " }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 422 when acceptedName is missing", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for a non-existent token", async () => {
    // Correctly shaped but not in the DB.
    const fake = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const res = await fetch(`${BASE}/api/self-serve/${fake}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Nobody" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("writes NO consents row for a renter with no person on file", async () => {
    // This rental was admin-created for a renter with no account, so
    // resolveSigner yields no `family_members` row and the canonical
    // person-scoped consent has nowhere to land. The endpoint must still
    // succeed (asserted above) — the rental's own waiver* columns are the
    // audit record. See the endpoint's comment: rentals gain a person via
    // resolvePerson in the rentals task, not here.
    const rows = await getDb()
      .select()
      .from(consents)
      .where(eq(consents.signedByName, "Test Renter"));
    // Scoped to THIS run: the shared staging DB keeps rows from earlier
    // runs, and the assertion is about what this signature did or didn't
    // write, not about the table's whole history.
    const mine = rows.filter((r) => r.signedAt >= SUITE_START);
    expect(mine).toHaveLength(0);
  });
});

// ── kiosk walk-in for a MINOR: the branch that DOES have a person ────────────
//
// A kiosk walk-in booked for a child carries `drop_in_bookings.family_member_id`
// (walkin/start.ts puts the child on the COPPA path under the parent), so
// resolveSigner returns a `family_members` row — the one self-serve branch
// where the canonical annual consent has somewhere to land. Fixture pattern
// mirrors tests/api/self-serve/context.test.ts's walk-in MINOR suite: drive
// the REAL kiosk endpoint rather than hand-inserting the booking.
describe("POST /api/self-serve/[token]/waiver — annual liability consent", () => {
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const PARENT_EMAIL = `waiver-consent-parent-${SUFFIX}@walkin-test.invalid`;
  const ADULT_EMAIL = `waiver-consent-adult-${SUFFIX}@walkin-test.invalid`;
  const CHILD_FIRST = "Sam";
  const CHILD_LAST = `Consentson${SUFFIX.slice(-4)}`;

  let locationId: string;
  let sessionId: string;
  const bookingIds: string[] = [];

  beforeAll(async () => {
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

    // Must still be running when /walkin/start is called — anchor to now.
    const startsAt = new Date(Date.now() + 5 * 60_000);
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `selfserve-waiver-consent-${SUFFIX}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 90 * 60_000),
        capacity: 20,
        teamCount: 2,
        teamColors: ["red", "blue"],
        audience: "all_ages",
        sessionRateCents: 1200,
        walkUpRateCents: 1900,
      })
      .returning();
    sessionId = session.id;
  });

  async function startWalkIn(body: Record<string, unknown>) {
    const res = await apiFetch(`/api/kiosk/${locationId}/walkin/start`, {
      method: "POST",
      body: JSON.stringify({ sessionId, ...body }),
    });
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    bookingIds.push(json.bookingId);
    return json as { token: string; bookingId: string };
  }

  async function signWaiver(token: string, acceptedName: string) {
    return apiFetch(`/api/self-serve/${token}/waiver`, {
      method: "POST",
      headers: { "User-Agent": "annual-waiver-selfserve-test/1.0" },
      body: JSON.stringify({ acceptedName }),
    });
  }

  it("kiosk minor signature → canonical org-scoped consents row for the CHILD", async () => {
    const { token, bookingId } = await startWalkIn({
      contact: {
        firstName: CHILD_FIRST,
        lastName: CHILD_LAST,
        email: PARENT_EMAIL,
        phone: "6145550021",
        dob: "2015-04-02",
      },
      parent: {
        firstName: "Dana",
        lastName: `Guardian${SUFFIX.slice(-4)}`,
        email: PARENT_EMAIL,
        phone: "6145550021",
      },
    });

    const [booking] = await getDb()
      .select({
        userId: dropInBookings.userId,
        familyMemberId: dropInBookings.familyMemberId,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(booking.familyMemberId).not.toBeNull();
    const childId = booking.familyMemberId!;

    const res = await signWaiver(token, "Dana Guardian");
    expect(res.status).toBe(200);

    const rows = await getDb()
      .select()
      .from(consents)
      .where(
        and(
          eq(consents.familyMemberId, childId),
          eq(consents.type, "liability"),
        ),
      );
    expect(rows).toHaveLength(1);
    // Org-scoped: this is what makes the annual predicate work at all.
    expect(rows[0].organizationId).toBe(E2E_ORG_ID);
    // The PARENT is the account of record; the typed name is who signed.
    expect(rows[0].signedByUserId).toBe(booking.userId);
    expect(rows[0].signedByName).toBe("Dana Guardian");
    expect(rows[0].status).toBe("granted");
    expect(rows[0].expiresAt).not.toBeNull();
    // ip/UA come from THIS request's context.
    expect(rows[0].userAgent).toBe("annual-waiver-selfserve-test/1.0");
    // The guardian variant the card rendered is preserved on the record.
    expect(rows[0].notes ?? "").toContain("variant=guardian");

    // A re-POST (double submit / refreshed link) must not append a second
    // audit row — recordLiabilityWaiver is append-only, so the annual gate
    // is the only thing standing between a refresh and a duplicate.
    const again = await signWaiver(token, "Dana Guardian");
    expect(again.status).toBe(200);
    const after = await getDb()
      .select()
      .from(consents)
      .where(
        and(
          eq(consents.familyMemberId, childId),
          eq(consents.type, "liability"),
        ),
      );
    expect(after).toHaveLength(1);
  });

  it("adult walk-in has no person row → 200 with no consents row written", async () => {
    const { token, bookingId } = await startWalkIn({
      contact: {
        firstName: "Alex",
        lastName: `Adultson${SUFFIX.slice(-4)}`,
        email: ADULT_EMAIL,
        phone: "6145550022",
        dob: "1990-01-01",
      },
    });

    const [booking] = await getDb()
      .select({ familyMemberId: dropInBookings.familyMemberId })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(booking.familyMemberId).toBeNull();

    const res = await signWaiver(token, "Alex Adultson");
    expect(res.status).toBe(200);

    // The booking row is still the audit record for an adult walk-in.
    const [row] = await getDb()
      .select({
        waiverSigned: dropInBookings.waiverSigned,
        waiverSignedBy: dropInBookings.waiverSignedBy,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Alex Adultson");
  });

  afterAll(async () => {
    const db = getDb();
    try {
      const created = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, [PARENT_EMAIL, ADULT_EMAIL]));
      const userIds = created.map((u) => u.id);
      if (userIds.length) {
        const kids = await db
          .select({ id: familyMembers.id })
          .from(familyMembers)
          .where(inArray(familyMembers.parentUserId, userIds));
        const kidIds = kids.map((k) => k.id);
        if (kidIds.length) {
          // A leaked liability consent would silently satisfy a LATER run's
          // "no waiver on file" fixture on the shared staging DB.
          await db
            .delete(consents)
            .where(inArray(consents.familyMemberId, kidIds));
        }
        if (bookingIds.length) {
          await db
            .delete(dropInBookings)
            .where(inArray(dropInBookings.id, bookingIds));
        }
        if (kidIds.length) {
          await db
            .delete(familyMembers)
            .where(inArray(familyMembers.id, kidIds));
        }
        await db.delete(users).where(inArray(users.id, userIds));
      }
    } finally {
      // Keep the fixture session off the venue command center's today board.
      const adminCookie = await getAdminCookie().catch(() => null);
      if (adminCookie && sessionId) {
        await apiFetch(`/api/admin/dropin/sessions/${sessionId}/cancel`, {
          method: "POST",
          cookie: adminCookie,
        }).catch(() => null);
        await apiFetch(`/api/admin/dropin/sessions/${sessionId}`, {
          method: "DELETE",
          cookie: adminCookie,
        }).catch(() => null);
      }
    }
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { consents } from "@/lib/db/schema/consents";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { venues, rosters } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { mintToken } from "@/lib/check-in/tokens-db";
import { WAIVER_VALID_DAYS } from "@/lib/consents/liability";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";
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

// ── field_rental (accounted renter): resolve-signer now resolves a person ────
//
// Task 6 fixed resolve-signer.ts's field_rental branch to resolve the
// renter's own SELF family_members row (via resolvePerson) whenever the
// rental has a renterUserId — previously hardcoded null, which made this
// endpoint's consent write dead for every rental regardless of the fix
// shipped alongside it. An admin-created rental with NO renterUserId (the
// suite above) still resolves no person and writes nothing — unchanged.
describe("POST /api/self-serve/[token]/waiver — field_rental annual waiver (accounted renter)", () => {
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdUserIds: string[] = [];
  const createdFamilyMemberIds: string[] = [];
  const createdRentalIds: string[] = [];

  async function makeAccountedRenter(label: string): Promise<string> {
    const email = `waiver-rental-${label}-${SUFFIX}@test.aspiresports.com`;
    const [user] = await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        firstName: "Sign",
        lastName: `Renter${label}`,
        emailVerified: true,
      })
      .returning();
    createdUserIds.push(user.id);
    return user.id;
  }

  async function mintRentalToken(userId: string, fieldNumber: number) {
    const start = new Date(RUN_BASE_UTC + (30 + fieldNumber) * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "online_booking",
        renterUserId: userId,
        renterName: "Sign Renter",
        renterEmail: "sign-renter@example.com",
        paymentMethod: "card_online",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
        waiverSigned: false,
      })
      .returning();
    createdRentalIds.push(rental.id);
    const tok = await mintToken({
      kind: "field_rental",
      targetId: rental.id,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: userId,
      recipientEmail: "sign-renter@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    return tok.token;
  }

  function liabilityRowsForSelf(userId: string) {
    return getDb()
      .select({
        familyMemberId: consents.familyMemberId,
        organizationId: consents.organizationId,
        signedByUserId: consents.signedByUserId,
        signedByName: consents.signedByName,
        status: consents.status,
        expiresAt: consents.expiresAt,
        userAgent: consents.userAgent,
      })
      .from(consents)
      .innerJoin(familyMembers, eq(familyMembers.id, consents.familyMemberId))
      .where(and(eq(familyMembers.selfUserId, userId), eq(consents.type, "liability")));
  }

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length) {
      const rows = await db
        .select({ id: familyMembers.id })
        .from(familyMembers)
        .where(inArray(familyMembers.selfUserId, createdUserIds));
      const fmIds = rows.map((r) => r.id);
      createdFamilyMemberIds.push(...fmIds);
    }
    if (createdFamilyMemberIds.length) {
      await db
        .delete(consents)
        .where(inArray(consents.familyMemberId, createdFamilyMemberIds));
    }
    if (createdRentalIds.length) {
      await db.delete(fieldRentals).where(inArray(fieldRentals.id, createdRentalIds));
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

  it("a fresh signature writes an org-scoped consents row for the renter's own SELF person", async () => {
    const userId = await makeAccountedRenter("fresh");
    const token = await mintRentalToken(userId, 10);

    const res = await apiFetch(`/api/self-serve/${token}/waiver`, {
      method: "POST",
      headers: { "User-Agent": "annual-waiver-rental-selfserve-test/1.0" },
      body: JSON.stringify({ acceptedName: "Sign Renter" }),
    });
    expect(res.status).toBe(200);

    const rows = await liabilityRowsForSelf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(E2E_ORG_ID);
    expect(rows[0].signedByUserId).toBe(userId);
    expect(rows[0].signedByName).toBe("Sign Renter");
    expect(rows[0].status).toBe("granted");
    expect(rows[0].expiresAt).not.toBeNull();
    expect(rows[0].userAgent).toBe("annual-waiver-rental-selfserve-test/1.0");
  });

  it("a covered renter signing a DIFFERENT rental has that signature appended", async () => {
    // Two rentals, two visits, two signatures. The first makes the renter
    // covered; the second is still a real human signing a real release on a
    // row that carries none. Coverage gates the ASK (build-context suppresses
    // the card), never the record — caller contract, clause 4. The old
    // behaviour dropped the second signature out of the canonical log
    // entirely, leaving a dated local row with nothing behind it.
    const userId = await makeAccountedRenter("covered-second");
    const firstToken = await mintRentalToken(userId, 12);
    const firstRes = await apiFetch(`/api/self-serve/${firstToken}/waiver`, {
      method: "POST",
      body: JSON.stringify({ acceptedName: "Sign Renter" }),
    });
    expect(firstRes.status).toBe(200);
    expect(await liabilityRowsForSelf(userId)).toHaveLength(1);

    const secondToken = await mintRentalToken(userId, 13);
    const secondRes = await apiFetch(`/api/self-serve/${secondToken}/waiver`, {
      method: "POST",
      headers: { "User-Agent": "covered-signs-selfserve/1.0" },
      body: JSON.stringify({ acceptedName: "Sign Renter Second Visit" }),
    });
    expect(secondRes.status).toBe(200);

    const rows = await liabilityRowsForSelf(userId);
    expect(rows).toHaveLength(2);
    const names = rows.map((r) => r.signedByName);
    expect(names).toContain("Sign Renter Second Visit");
    const appended = rows.find((r) => r.signedByName === "Sign Renter Second Visit")!;
    // ip/UA from THIS request's context, never the body.
    expect(appended.userAgent).toBe("covered-signs-selfserve/1.0");
  });

  it("a re-POST on the SAME rental does not append a second consents row", async () => {
    const userId = await makeAccountedRenter("repeat");
    const token = await mintRentalToken(userId, 11);

    const first = await apiFetch(`/api/self-serve/${token}/waiver`, {
      method: "POST",
      body: JSON.stringify({ acceptedName: "Sign Renter" }),
    });
    expect(first.status).toBe(200);
    expect(await liabilityRowsForSelf(userId)).toHaveLength(1);

    // The token is never consumed by this endpoint (that only happens for
    // single-use check-in flows elsewhere) — a second POST on the SAME
    // token (double submit / refreshed link) must not append a second audit
    // row. What stops it is PER-ROW idempotency ("this rental already carries
    // a signature"), not coverage: one signing event delivered twice is not
    // two signing events, while the test above shows two real signings on two
    // rentals both get recorded.
    const second = await apiFetch(`/api/self-serve/${token}/waiver`, {
      method: "POST",
      body: JSON.stringify({ acceptedName: "Sign Renter Again" }),
    });
    expect(second.status).toBe(200);
    expect(await liabilityRowsForSelf(userId)).toHaveLength(1);
  });
});

// ── roster_entry: the branch with a person ALWAYS and no local column ────────
//
// The largest behaviour delta in the annual-waiver change lives here.
// build-context used to hardcode `outstanding.waiver = true` for every
// roster_entry token, so a rostered kid was handed the waiver at every single
// game; it now defers to the annual predicate. And the signature endpoint has
// nothing local to stamp for this kind — `rosters` carries no waiver columns
// (the registration-time signature lives on `registrations`) — which makes the
// `consents` row the ONLY record this branch produces. Both are asserted.
//
// The assertions share one fixture chain and run in the order a real game-day
// link is used: context asks → signature POST → context stops asking → the
// signature ages out and it asks again.
describe("self-serve roster_entry — annual waiver", () => {
  let organizationId: string;
  let parentUserId: string;
  let childId: string;
  let rosterId: string;
  let registrationId: string;
  let token: string;

  beforeAll(async () => {
    const db = getDb();
    // Its own org chain (org → location → sport → program → season → team):
    // resolveSigner's roster_entry lookup joins rosters → registrations →
    // teams → seasons → programs → locations.organizationId, so the fixture
    // has to be a complete one. Deliberately NOT hung off the seeded E2E org
    // — a stray program/season there would surface in the public catalog and
    // in other suites' listings.
    const ctx = await createTestGameContext({});
    organizationId = ctx.organizationId;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [parent] = await db
      .insert(users)
      .values({
        email: `roster-waiver-${stamp}@test.example`,
        firstName: "Rostered",
        lastName: "Parent",
      })
      .returning();
    parentUserId = parent.id;

    const [kid] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parent.id,
        firstName: "Rosie",
        lastName: `Rostered${stamp.slice(-4)}`,
        birthDate: "2016-01-01",
      })
      .returning();
    childId = kid.id;

    const [registration] = await db
      .insert(registrations)
      .values({
        seasonId: ctx.seasonId,
        familyMemberId: kid.id,
        registeredByUserId: parent.id,
        status: "confirmed",
        amountDueCents: 15000,
      })
      .returning();
    registrationId = registration.id;

    const [roster] = await db
      .insert(rosters)
      .values({
        teamId: ctx.homeTeamId,
        registrationId: registration.id,
        status: "active",
      })
      .returning();
    rosterId = roster.id;

    const tok = await mintToken({
      kind: "roster_entry",
      targetId: roster.id,
      organizationId,
      venueId: null,
      sentVia: "qr",
      recipientUserId: parent.id,
      recipientEmail: parent.email,
      recipientPhone: null,
      createdByUserId: null,
    });
    token = tok.token;
  });

  async function contextWaiverOutstanding(): Promise<boolean> {
    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenKind).toBe("roster_entry");
    return body.outstanding.waiver as boolean;
  }

  function liabilityRows() {
    return getDb()
      .select()
      .from(consents)
      .where(
        and(
          eq(consents.familyMemberId, childId),
          eq(consents.type, "liability"),
        ),
      );
  }

  it("with no consent on file the waiver is outstanding", async () => {
    expect(await contextWaiverOutstanding()).toBe(true);
  });

  it("signing writes the consents row — the only record this branch produces", async () => {
    const res = await apiFetch(`/api/self-serve/${token}/waiver`, {
      method: "POST",
      headers: { "User-Agent": "annual-waiver-roster-test/1.0" },
      body: JSON.stringify({ acceptedName: "Rostered Parent" }),
    });
    expect(res.status).toBe(200);

    const rows = await liabilityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(organizationId);
    expect(rows[0].signedByUserId).toBe(parentUserId);
    expect(rows[0].signedByName).toBe("Rostered Parent");
    expect(rows[0].status).toBe("granted");
    expect(rows[0].userAgent).toBe("annual-waiver-roster-test/1.0");
    // A parent signing for their kid gets the guardian language.
    expect(rows[0].notes ?? "").toContain("variant=guardian");
  });

  it("...and the same player is not asked again at the next game", async () => {
    // No new token, no new row — the predicate is per person + org, so the
    // flag flips for the SAME link and for every future roster link.
    expect(await contextWaiverOutstanding()).toBe(false);
  });

  it("an expired signature is asked again", async () => {
    // Age the only consent past its window: `expiresAt` is what the canonical
    // predicate reads, and roster_entry has no dated local row for the legacy
    // fallback to rescue it with.
    const longAgo = new Date(Date.now() - (WAIVER_VALID_DAYS + 10) * 86_400_000);
    await getDb()
      .update(consents)
      .set({
        signedAt: longAgo,
        expiresAt: new Date(longAgo.getTime() + WAIVER_VALID_DAYS * 86_400_000),
      })
      .where(eq(consents.familyMemberId, childId));

    expect(await contextWaiverOutstanding()).toBe(true);
  });

  afterAll(async () => {
    const db = getDb();
    // Consents reference family_members; rosters reference registrations.
    // Unwind in FK order. A leaked liability row would silently satisfy a
    // later run's "no waiver on file" fixture on the shared staging DB.
    await db.delete(consents).where(eq(consents.familyMemberId, childId));
    if (rosterId) await db.delete(rosters).where(eq(rosters.id, rosterId));
    if (registrationId) {
      await db.delete(registrations).where(eq(registrations.id, registrationId));
    }
    await db.delete(familyMembers).where(eq(familyMembers.id, childId));
    await db.delete(users).where(eq(users.id, parentUserId));
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { consents } from "@/lib/db/schema/consents";
import { mintToken, consumeToken } from "@/lib/check-in/tokens-db";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Unique slot per run to avoid collisions with other test files.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("GET /api/self-serve/[token] (context)", () => {
  let rentalId: string;
  let tokenValue: string;
  let tokenId: string;

  beforeAll(async () => {
    // Seed a field_rental row.
    const start = new Date(RUN_BASE_UTC + 11 * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 50,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Context Test Renter",
        renterEmail: "context-test@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = rental.id;

    // Mint a token for the rental.
    const tok = await mintToken({
      kind: "field_rental",
      targetId: rentalId,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: null,
      recipientEmail: "context-test@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    tokenValue = tok.token;
    tokenId = tok.id;
  });

  it("returns 200 with context payload for a valid token", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tokenKind", "field_rental");
    expect(typeof body.displayName).toBe("string");
    expect(body.displayName.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("summary");
    expect(typeof body.summary).toBe("string");
    expect(body).toHaveProperty("outstanding");
    expect(body.outstanding.waiver).toBe(true);
    // This rental was admin-created for a renter with NO account (renterUserId
    // null), so there is no user row and no family_member row to hang a photo
    // on. No target → the photo step is never offered. It must not block, and
    // it must not 500.
    expect(body.outstanding.photo).toBe(false);
    // field_rental is never a minor-signs-for-a-minor path — isMinor is
    // always false. This fixture's renter has NO account (renterUserId
    // null, admin-created), so it also resolves no family_members row; see
    // the "annual waiver" describe below for the accounted-renter case,
    // which DOES resolve one via resolvePerson.
    expect(body.isMinor).toBe(false);
    expect(body).toHaveProperty("expiresAt");
  });

  it("returns 410 for a consumed token", async () => {
    // Consume the token directly via DB helper.
    await consumeToken(tokenId, null);
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}`);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).toHaveProperty("error", "consumed");
  });

  it("returns 404 for a bad-shape token value", async () => {
    // "short" is only 5 chars — fails isTokenShape() with reason bad_shape.
    const res = await fetch(`${BASE}/api/self-serve/short`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error", "bad_shape");
  });

  it("returns 404 for a correctly-shaped but non-existent token", async () => {
    // 43 valid base64url chars that don't exist in the DB.
    const fake = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const res = await fetch(`${BASE}/api/self-serve/${fake}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error", "not_found");
  });
});

// ── walkin_session context: outstanding.payment, amountDueCents, locationSlug ──
//
// The walk-in kiosk link mints a `walkin_session` token (not
// `drop_in_booking` — verified against src/pages/api/kiosk/[locationSlug]/
// walkin/start.ts). The fixture booking is created via the real
// POST /api/kiosk/{locationId}/walkin/start endpoint, the same way a
// production pay-link hold is created — mirroring
// tests/api/kiosk/walkin.test.ts rather than inserting the row by hand.
describe("GET /api/self-serve/[token] (context) — walk-in payment hold", () => {
  let locationId: string;
  let locationSlug: string;
  let sessionId: string;
  const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

    const [location] = await db
      .select({ slug: locations.slug })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (!location) throw new Error("Resolved location row not found.");
    locationSlug = location.slug;

    // /walkin/start rejects a session whose endsAt has already passed, so the
    // fixture must END in the future. Anchoring off UTC midnight (+3h) put it
    // in the past for every run after 04:30 UTC. Anchor to "now" instead —
    // same fix walkin.test.ts carries.
    const now = new Date();
    const sessionStart = new Date(now.getTime() + 5 * 60_000);
    const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `context-walkin-${UNIQUE_SUFFIX}`,
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
  });

  async function startWalkIn(emailPrefix: string) {
    const res = await apiFetch(`/api/kiosk/${locationId}/walkin/start`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        contact: {
          firstName: "Context",
          lastName: "Walkin",
          email: `${emailPrefix}-${UNIQUE_SUFFIX}@walkin-test.invalid`,
          phone: "6145550002",
          dob: "1990-01-01",
        },
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    return body as { token: string; bookingId: string; amountDueCents: number };
  }

  it("pending_payment booking: outstanding.payment true, correct amountDueCents + locationSlug", async () => {
    const { token, bookingId, amountDueCents } = await startWalkIn("held");

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tokenKind).toBe("walkin_session");
    expect(body.outstanding.payment).toBe(true);
    // Walk-up rate wins over the session rate — same 1900 the kiosk endpoint
    // itself returned from walkin/start.
    expect(body.amountDueCents).toBe(1900);
    expect(body.amountDueCents).toBe(amountDueCents);
    expect(body.locationSlug).toBe(locationSlug);
    expect(body.bookingId).toBe(bookingId);
  });

  // outstanding.photo was initialized false and NEVER assigned, so PhotoCard
  // (which SelfServe gates on it) had never rendered for any customer. The
  // flag is now real: true for a person with no photo on file, false once one
  // exists — so a returning customer isn't asked again. The target is derived
  // by the same helper the upload endpoint writes through (resolvePhotoTarget),
  // which for a walk-in adult is users.avatarUrl.
  it("photo: outstanding for a fresh person, settled once a photo is on file", async () => {
    const { token, bookingId } = await startWalkIn("photo");

    const first = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(first.status).toBe(200);
    expect((await first.json()).outstanding.photo).toBe(true);

    // Put a photo on the exact row the upload endpoint would have written.
    const [booking] = await getDb()
      .select({ userId: dropInBookings.userId })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    await getDb()
      .update(users)
      .set({ avatarUrl: "mock-r2://photo-context-test.jpg" })
      .where(eq(users.id, booking.userId));

    const second = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(second.status).toBe(200);
    expect((await second.json()).outstanding.photo).toBe(false);
  });

  it("confirmed booking: outstanding.payment false, amountDueCents/locationSlug reset", async () => {
    const { token, bookingId } = await startWalkIn("confirmed");

    // Simulate the webhook flipping the hold to confirmed (the same
    // transition handleDropinWalkinPayment performs on a successful charge)
    // without actually driving Stripe.
    await getDb()
      .update(dropInBookings)
      .set({ status: "confirmed", amountPaidCents: 1900, promotionExpiresAt: null })
      .where(eq(dropInBookings.id, bookingId));

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.outstanding.payment).toBe(false);
    expect(body.amountDueCents).toBe(0);
    expect(body.locationSlug).toBeNull();
    expect(body.cancelled).toBe(false);
    expect(body.refunded).toBe(false);
  });

  it("cancelled booking: cancelled true, refunded false, nothing outstanding/payable", async () => {
    const { token, bookingId } = await startWalkIn("cancelled");

    // Simulate the expiry sweep releasing the hold.
    await getDb()
      .update(dropInBookings)
      .set({
        status: "cancelled",
        cancellationReason: "expired_payment_hold",
        cancelledAt: new Date(),
      })
      .where(eq(dropInBookings.id, bookingId));

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cancelled).toBe(true);
    expect(body.refunded).toBe(false);
    // A released hold has nothing actionable — the page must not offer
    // the pay/waiver/photo cards for a slot that no longer exists.
    expect(body.outstanding.payment).toBe(false);
    expect(body.outstanding.waiver).toBe(false);
    expect(body.outstanding.photo).toBe(false);
    expect(body.amountDueCents).toBe(0);
    expect(body.locationSlug).toBeNull();
  });

  it("cancelled booking with a refund on record: refunded true", async () => {
    const { token, bookingId } = await startWalkIn("cancelled-refunded");

    // The late-payment auto-refund path (handle-dropin-walkin-payment.ts)
    // leaves the booking cancelled with a stripeRefundId recorded.
    await getDb()
      .update(dropInBookings)
      .set({
        status: "cancelled",
        cancellationReason: "expired_payment_hold",
        cancelledAt: new Date(),
        stripePaymentIntentId: "pi_context_test",
        stripeRefundId: "re_context_test",
      })
      .where(eq(dropInBookings.id, bookingId));

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cancelled).toBe(true);
    expect(body.refunded).toBe(true);
  });

  // Cancel + hard-delete the fixture session so it doesn't linger on the
  // venue command center's "today" board — mirrors tests/api/kiosk/
  // walkin.test.ts and tests/api/venue-hold-visibility.test.ts, which do
  // this specifically so the venue-command-center e2e activity-roster test
  // doesn't trip over a stray block. Best-effort: failures here shouldn't
  // fail the suite.
  afterAll(async () => {
    const adminCookie = await getAdminCookie().catch(() => null);
    if (!adminCookie || !sessionId) return;
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

// ── walkin_session context: a MINOR walking into the kiosk ───────────────────
//
// The kiosk explicitly supports minors (walkin/start.ts validates parent
// fields and creates a family_members row on the parent_user_id path), but the
// booking's userId is the PARENT — so nothing but drop_in_bookings
// .family_member_id can say who actually plays.
//
// When resolveSigner ignored that (it hardcoded `isMinor: false` for every
// drop_in_booking/walkin_session), two things broke, and both are asserted
// here because nothing else in the suite ever produced an isMinor:true fixture:
//   1. WaiverCard rendered the ADULT acceptance line ("I have read and accept
//      these terms" + "Signature") and named the PARENT as the participant —
//      a guardian signing a liability waiver for a child who appears nowhere
//      on the page.
//   2. resolvePhotoTarget fell through to { kind: "user" } = the parent, so
//      the child's kiosk photo would be saved as the PARENT's account avatar,
//      and hasPhotoOnFile() asked the parent's row — a parent who already had
//      an avatar meant the child was never even offered a photo.
describe("GET /api/self-serve/[token] (context) — walk-in MINOR", () => {
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const PARENT_EMAIL = `minor-ctx-parent-${SUFFIX}@walkin-test.invalid`;
  const ADULT_EMAIL = `minor-ctx-adult-${SUFFIX}@walkin-test.invalid`;
  const CHILD_FIRST = "Robin";
  const CHILD_LAST = `Minorson${SUFFIX.slice(-4)}`;
  const PARENT_FIRST = "Dana";
  const PARENT_LAST = `Guardian${SUFFIX.slice(-4)}`;

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

    // Must still be running when /walkin/start is called — see the endsAt
    // guard note in the adult beforeAll above.
    const now = new Date();
    const startsAt = new Date(now.getTime() + 5 * 60_000);
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `context-walkin-minor-${SUFFIX}`,
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

  it("resolves the CHILD as the participant and the PARENT as the signer", async () => {
    // Exactly the payload WalkInWizard sends once the DOB it collected is
    // under 18: the child in `contact`, the guardian in `parent`.
    const { token, bookingId } = await startWalkIn({
      contact: {
        firstName: CHILD_FIRST,
        lastName: CHILD_LAST,
        email: PARENT_EMAIL,
        phone: "6145550009",
        dob: "2015-04-02", // 10 years old
      },
      parent: {
        firstName: PARENT_FIRST,
        lastName: PARENT_LAST,
        email: PARENT_EMAIL,
        phone: "6145550009",
      },
    });

    // The booking is booked UNDER THE PARENT — this is what made the bug
    // invisible: everything downstream that reads booking.userId sees an adult.
    const [booking] = await getDb()
      .select({
        userId: dropInBookings.userId,
        familyMemberId: dropInBookings.familyMemberId,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(booking.familyMemberId).not.toBeNull();

    // Give the PARENT an avatar BEFORE asking for context. If the photo target
    // were still the parent (Critical 2), hasPhotoOnFile() would report a photo
    // on file and outstanding.photo would come back false — the child would
    // never be offered a photo, and any photo they did upload would overwrite
    // this avatar. outstanding.photo MUST stay true: the target is the child.
    await getDb()
      .update(users)
      .set({ avatarUrl: "mock-r2://parent-avatar-already-on-file.jpg" })
      .where(eq(users.id, booking.userId));

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tokenKind).toBe("walkin_session");
    // Critical 1: the guardian consent language + "Parent/guardian signature"
    // label in WaiverCard hang off this flag alone.
    expect(body.isMinor).toBe(true);
    // The waiver says "the player named above is physically able to
    // participate" — the player named above must be the CHILD.
    expect(body.displayName).toBe(`${CHILD_FIRST} ${CHILD_LAST}`);
    // ...and the person signing is the guardian.
    expect(body.signerName).toBe(`${PARENT_FIRST} ${PARENT_LAST}`);
    // Critical 2: the photo target is the child (family_members.photoUrl),
    // not the parent's users.avatarUrl — which we just populated.
    expect(body.outstanding.photo).toBe(true);
    expect(body.outstanding.waiver).toBe(true);

    // And the resolved family member really is the child on the COPPA path.
    const [fm] = await getDb()
      .select({
        firstName: familyMembers.firstName,
        parentUserId: familyMembers.parentUserId,
      })
      .from(familyMembers)
      .where(eq(familyMembers.id, booking.familyMemberId!))
      .limit(1);
    expect(fm.firstName).toBe(CHILD_FIRST);
    expect(fm.parentUserId).toBe(booking.userId);
  });

  // ANNUAL WAIVER: a person who signed elsewhere inside the 365-day window
  // must not be asked again at the kiosk. The derivation used to read the
  // booking row's own `waiverSigned` flag alone, which is per-target and
  // therefore always false on a brand-new hold.
  //
  // The roster_entry half of this derivation — the branch that used to
  // hardcode `outstanding.waiver = true` — is covered in
  // tests/api/self-serve/waiver.test.ts, which owns the org→season→roster
  // fixture chain that branch needs.
  it("a child with a valid liability consent is not asked to sign again", async () => {
    const { token, bookingId } = await startWalkIn({
      contact: {
        firstName: "Casey",
        lastName: `Covered${SUFFIX.slice(-4)}`,
        email: PARENT_EMAIL,
        phone: "6145550011",
        dob: "2015-06-01",
      },
      parent: {
        firstName: PARENT_FIRST,
        lastName: PARENT_LAST,
        email: PARENT_EMAIL,
        phone: "6145550011",
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

    // Before the consent exists, the kiosk asks.
    const before = await fetch(`${BASE}/api/self-serve/${token}`);
    expect((await before.json()).outstanding.waiver).toBe(true);

    // A signature from a month ago, at THIS org — the canonical row shape.
    const signedAt = new Date(Date.now() - 30 * 86_400_000);
    await getDb()
      .insert(consents)
      .values({
        familyMemberId: booking.familyMemberId!,
        organizationId: E2E_ORG_ID,
        type: "liability",
        status: "granted",
        signedByUserId: booking.userId,
        signedByName: `${PARENT_FIRST} ${PARENT_LAST}`,
        signedAt,
        expiresAt: new Date(signedAt.getTime() + 365 * 86_400_000),
      });

    const after = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(after.status).toBe(200);
    const body = await after.json();
    expect(body.outstanding.waiver).toBe(false);
    // Nothing else about the context changes — the photo is still owed.
    expect(body.isMinor).toBe(true);
    expect(body.outstanding.photo).toBe(true);
  });

  it("adult walk-in still reports isMinor false and signs for themselves", async () => {
    const { token, bookingId } = await startWalkIn({
      contact: {
        firstName: "Alex",
        lastName: `Adultson${SUFFIX.slice(-4)}`,
        email: ADULT_EMAIL,
        phone: "6145550010",
        dob: "1990-01-01",
      },
    });

    const [booking] = await getDb()
      .select({ familyMemberId: dropInBookings.familyMemberId })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(booking.familyMemberId).toBeNull();

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.isMinor).toBe(false);
    expect(body.displayName).toBe(`Alex Adultson${SUFFIX.slice(-4)}`);
    expect(body.signerName).toBe(body.displayName); // adult signs for themselves
  });

  afterAll(async () => {
    const db = getDb();
    try {
      if (bookingIds.length) {
        await db
          .delete(dropInBookings)
          .where(inArray(dropInBookings.id, bookingIds));
      }
      const created = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, [PARENT_EMAIL, ADULT_EMAIL]));
      const userIds = created.map((u) => u.id);
      if (userIds.length) {
        // Liability consents reference family_members — drop them first, and
        // so a leaked row can't silently satisfy a LATER run's
        // "no waiver on file" fixture on the shared staging DB.
        const kids = await db
          .select({ id: familyMembers.id })
          .from(familyMembers)
          .where(inArray(familyMembers.parentUserId, userIds));
        const kidIds = kids.map((k) => k.id);
        if (kidIds.length) {
          await db
            .delete(consents)
            .where(inArray(consents.familyMemberId, kidIds));
        }
        await db
          .delete(familyMembers)
          .where(inArray(familyMembers.parentUserId, userIds));
        await db.delete(users).where(inArray(users.id, userIds));
      }
    } finally {
      // Cancel + delete the fixture session so it never shows on the venue
      // command center's "today" board (see the walk-in payment suite above).
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

// ── field_rental (accounted renter): the annual predicate narrows outstanding.waiver ──
//
// Every context.test.ts fixture above books the rental with NO renterUserId
// (admin-created for a guest), so resolveSigner never had a family_members
// row to consult. An ONLINE-booked rental has a renterUserId — Task 6 made
// resolveSigner resolve that renter's own SELF row via resolvePerson, which
// is what lets the shared annual-waiver pass in build-context.ts (the block
// right above `if (outstanding.waiver && signer.familyMemberId)`) actually
// run for this kind. Fresh accounts only: the annual waiver is a real,
// persistent grant and must not leak across other suites' shared accounts.
describe("GET /api/self-serve/[token] (context) — field_rental annual waiver", () => {
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const PASSWORD = "RentalWaiverCtx123!";
  const createdUserIds: string[] = [];
  const createdFamilyMemberIds: string[] = [];
  const createdRentalIds: string[] = [];

  async function makeAccountedRenter(label: string): Promise<string> {
    const email = `ctx-rental-waiver-${label}-${SUFFIX}@test.aspiresports.com`;
    const [user] = await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        firstName: "Ctx",
        lastName: `Renter${label}`,
        emailVerified: true,
      })
      .returning();
    createdUserIds.push(user.id);
    return user.id;
  }

  async function giveValidWaiver(userId: string): Promise<void> {
    const [person] = await getDb()
      .insert(familyMembers)
      .values({ selfUserId: userId, firstName: "Ctx", lastName: "Renter" })
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
        signedByName: "Ctx Renter",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + 365 * 86_400_000),
      });
  }

  async function mintRentalToken(userId: string, fieldNumber: number) {
    const start = new Date(RUN_BASE_UTC + (13 + fieldNumber) * 3_600_000);
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
        renterName: "Ctx Renter",
        renterEmail: "ctx-renter@example.com",
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
      recipientEmail: "ctx-renter@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    return tok.token;
  }

  afterAll(async () => {
    const db = getDb();
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

  it("a covered renter's field_rental token reports outstanding.waiver false", async () => {
    const userId = await makeAccountedRenter("covered");
    await giveValidWaiver(userId);
    const token = await mintRentalToken(userId, 60);

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenKind).toBe("field_rental");
    // The rental row itself is still unsigned (waiverSigned: false above) —
    // it's the ANNUAL predicate, not the per-target column, that settles it.
    expect(body.outstanding.waiver).toBe(false);
  });

  it("an uncovered accounted renter's field_rental token still asks", async () => {
    const userId = await makeAccountedRenter("uncovered");
    const token = await mintRentalToken(userId, 61);

    const res = await fetch(`${BASE}/api/self-serve/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outstanding.waiver).toBe(true);
  });
});

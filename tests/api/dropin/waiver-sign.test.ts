/**
 * POST /api/dropin/bookings/:id/waiver — post-payment waiver signing
 * ("sign before you PLAY, not before you pay").
 *
 * Covers the two auth paths and idempotency:
 *   - signed-in booking owner
 *   - guest capability token (the booking's stripe_payment_intent_id)
 *   - already-signed → 200 no-op, first signature stands
 *   - strangers (no session, wrong/absent PI) → 404, no data leak
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import { familyMembers } from "@/lib/db/schema/registrations";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  WAIVER_VALID_DAYS,
} from "@/lib/consents/liability";
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language";
import { DROPIN_WAIVER_ACCEPT_LABEL } from "@/lib/dropin/waiver-text";
import { apiFetch, expectJson, getParentCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import {
  createTestChild,
  CLASS_TEST_PARENT_EMAIL,
} from "../../utils/classes-helpers";

// HTTP requests to localhost resolve the DEFAULT org via the domain
// resolver; fixtures must live under it or the endpoint's multi-tenant
// guard 403s.
let defaultOrg: { organizationId: string; venueId: string };

beforeAll(async () => {
  defaultOrg = await resolveDefaultOrgForHttpTests();
});

const freeSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 0,
    memberRateCents: 0,
  });

/** Book a free session as the parent test account WITHOUT a waiver —
 *  the current UI's flow — and return the unsigned booking id. */
async function bookUnsignedAsParent(cookie: string): Promise<string> {
  const ctx = await freeSessionInDefaultOrg();
  const res = await apiFetch("/api/dropin/bookings", {
    method: "POST",
    cookie,
    body: JSON.stringify({ sessionId: ctx.sessionId }),
  });
  const json = await expectJson(res, 200);
  expect(json.paymentRequired).toBe(false);
  return json.bookingId as string;
}

/** Direct DB insert of a confirmed, unsigned booking for a fresh
 *  passwordless user carrying a PaymentIntent id — the shape the webhook
 *  writes for an inline guest payment. */
async function insertGuestBookingWithPi(): Promise<{
  bookingId: string;
  paymentIntentId: string;
}> {
  const db = getDb();
  const ctx = await freeSessionInDefaultOrg();
  const [user] = await db
    .insert(users)
    .values({
      email: `dropin-waiver-pi-${Date.now()}-${Math.random()}@t.example`,
      firstName: "Waiver",
      lastName: "Guest",
    })
    .returning();
  const paymentIntentId = `pi_waiver_test_${Math.random().toString(36).slice(2)}`;
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: ctx.sessionId,
      userId: user.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
      stripePaymentIntentId: paymentIntentId,
      waiverSigned: false,
    })
    .returning();
  return { bookingId: booking.id, paymentIntentId };
}

describe("POST /api/dropin/bookings/:id/waiver", () => {
  it("signs via the owner's session, then no-ops on re-sign (first signature stands)", async () => {
    const cookie = await getParentCookie();
    const bookingId = await bookUnsignedAsParent(cookie);

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Signer" }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);
    expect(json.alreadySigned).toBe(false);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Parent Signer");
    expect(row.waiverSignedAt).not.toBeNull();

    // Idempotent: a second sign is a 200 no-op and never overwrites.
    const again = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Someone Else" }),
    });
    const againJson = await expectJson(again, 200);
    expect(againJson.alreadySigned).toBe(true);

    const [after] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(after.waiverSignedBy).toBe("Parent Signer");
  });

  it("signs via the PaymentIntent capability token — no login session", async () => {
    const { bookingId, paymentIntentId } = await insertGuestBookingWithPi();

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({
        waiverName: "Guest Signer",
        paymentIntentId,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Guest Signer");
  });

  it("404s a caller with no session and no/wrong capability token", async () => {
    const { bookingId } = await insertGuestBookingWithPi();

    const noToken = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({ waiverName: "Stranger" }),
    });
    expect(noToken.status).toBe(404);

    const wrongToken = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({
        waiverName: "Stranger",
        paymentIntentId: "pi_wrong_token",
      }),
    });
    expect(wrongToken.status).toBe(404);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(false);
  });

  it("400s an empty waiverName", async () => {
    const { bookingId, paymentIntentId } = await insertGuestBookingWithPi();
    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({ waiverName: "   ", paymentIntentId }),
    });
    expect(res.status).toBe(400);
  });
});

/**
 * ANNUAL WAIVER on the post-payment WaiverCard endpoint.
 *
 * Two halves, mirroring the paid drop-in door (tests/api/classes/
 * paid-makeup.test.ts):
 *
 *   (a) the participant already has a valid liability consent → the endpoint
 *       must NOT ask again. It short-circuits `alreadySigned: true` and
 *       stamps the booking with the shared on-file attribution. The stamp
 *       carries NO signature date on purpose: `hasValidLiabilityWaiver`'s
 *       legacy fallback accepts DATED drop_in_bookings rows, so a dated
 *       derived copy would let each booking renew the very window it was
 *       derived from.
 *   (b) no valid consent → the typed signature is a FRESH one and must land
 *       in the canonical `consents` log, org-scoped, with the ip/UA of the
 *       request that carried it.
 *
 * Adult bookings (no `family_member_id`) are covered by the suite above and
 * are deliberately unchanged — an adult drop-in has no `family_members` row
 * to hang a person-scoped consent on.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

describe("POST /api/dropin/bookings/:id/waiver — annual liability waiver", () => {
  let parentUserId: string;
  const childIds: string[] = [];

  beforeAll(async () => {
    const [parent] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, CLASS_TEST_PARENT_EMAIL))
      .limit(1);
    if (!parent) {
      throw new Error(
        `${CLASS_TEST_PARENT_EMAIL} is not seeded — run npm run db:seed:e2e first`,
      );
    }
    parentUserId = parent.id;
  });

  // The staging DB is shared across runs; a leaked consents row would
  // silently satisfy a LATER run's "no waiver on file" fixture.
  afterAll(async () => {
    if (childIds.length === 0) return;
    const db = getDb();
    await db.delete(consents).where(inArray(consents.familyMemberId, childIds));
    await db
      .delete(dropInBookings)
      .where(inArray(dropInBookings.familyMemberId, childIds));
    await db.delete(familyMembers).where(inArray(familyMembers.id, childIds));
  });

  async function newChild(label: string): Promise<string> {
    const id = await createTestChild(
      parentUserId,
      `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`,
    );
    childIds.push(id);
    return id;
  }

  /** A confirmed, unsigned booking whose PARTICIPANT is the given child —
   *  the shape the paid child make-up door fulfills. */
  async function insertChildBooking(familyMemberId: string): Promise<string> {
    const ctx = await freeSessionInDefaultOrg();
    const [booking] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: parentUserId,
        familyMemberId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        waiverSigned: false,
      })
      .returning();
    return booking.id;
  }

  /** Direct `consents` insert — the row shape a real signature produces. */
  async function insertLiabilityConsent(
    familyMemberId: string,
    signedDaysAgo: number,
  ): Promise<void> {
    const signedAt = new Date(Date.now() - signedDaysAgo * DAY_MS);
    await getDb()
      .insert(consents)
      .values({
        familyMemberId,
        organizationId: defaultOrg.organizationId,
        type: "liability",
        status: "granted",
        signedByUserId: parentUserId,
        signedByName: "Parent Test",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
      });
  }

  function liabilityRowsFor(familyMemberId: string) {
    return getDb()
      .select()
      .from(consents)
      .where(
        and(
          eq(consents.familyMemberId, familyMemberId),
          eq(consents.type, "liability"),
        ),
      );
  }

  it("(a) covered participant who signs anyway → the REAL signature is dated, named, and appended", async () => {
    // This endpoint cannot be reached without a typed name (the schema
    // requires `waiverName`), so EVERY request here is a human signing.
    // Coverage gates the ASK — the session page suppresses the card for a
    // covered participant — not the record. A signature that arrives despite
    // that is a real signing event and is filed as one (caller contract,
    // clause 4).
    const cookie = await getParentCookie();
    const childId = await newChild("OnFile");
    await insertLiabilityConsent(childId, 30);
    const bookingId = await insertChildBooking(childId);

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      headers: { "User-Agent": "covered-signs-dropin/1.0" },
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);
    expect(json.alreadySigned).toBe(false);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Parent Test");
    expect(row.waiverSignedAt).not.toBeNull();

    // Exactly ONE row appended: the seeded grant plus this signature.
    const rows = await liabilityRowsFor(childId);
    expect(rows).toHaveLength(2);
    const newest = [...rows].sort(
      (a, b) => b.signedAt.getTime() - a.signedAt.getTime(),
    )[0];
    expect(newest.signedByName).toBe("Parent Test");
    expect(newest.userAgent).toBe("covered-signs-dropin/1.0");
  });

  it("(a1) a BORN-STAMPED booking is not a replay — the arriving signature is recorded", async () => {
    // The paid child door's fulfillment (and walkin/start.ts) births a covered
    // booking `waiverSigned: true` with a NULL date. Nobody signed it. A
    // replay guard on the bare flag would answer "already signed" and swallow
    // the real signature that arrives afterwards; only a DATED prior signature
    // is a replay.
    const cookie = await getParentCookie();
    const childId = await newChild("BornStamped");
    await insertLiabilityConsent(childId, 10);
    const bookingId = await insertChildBooking(childId);
    await getDb()
      .update(dropInBookings)
      .set({
        waiverSigned: true,
        waiverSignedBy: WAIVER_ON_FILE_ATTRIBUTION,
        waiverSignedAt: null,
      })
      .where(eq(dropInBookings.id, bookingId));

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    expect((await expectJson(res, 200)).alreadySigned).toBe(false);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSignedBy).toBe("Parent Test");
    expect(row.waiverSignedAt).not.toBeNull();
    // The seeded grant plus exactly one append standing behind that new date.
    expect(await liabilityRowsFor(childId)).toHaveLength(2);
  });

  it("(a2) a REPLAY of an already-signed booking is still a no-op — per-row, not coverage", async () => {
    // The idempotency that survives is per BOOKING ROW ("the first signature
    // stands"), which is orthogonal to coverage: it distinguishes one signing
    // event delivered twice from two real signing events.
    const cookie = await getParentCookie();
    const childId = await newChild("Replay");
    const bookingId = await insertChildBooking(childId);

    const first = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    expect((await expectJson(first, 200)).alreadySigned).toBe(false);
    expect(await liabilityRowsFor(childId)).toHaveLength(1);

    const replay = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    expect((await expectJson(replay, 200)).alreadySigned).toBe(true);
    expect(await liabilityRowsFor(childId)).toHaveLength(1);
  });

  it("(b) no waiver on file → fresh signature writes the canonical org-scoped consents row", async () => {
    const cookie = await getParentCookie();
    const childId = await newChild("Fresh");
    const bookingId = await insertChildBooking(childId);

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      headers: { "User-Agent": "annual-waiver-dropin-test/1.0" },
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    const json = await expectJson(res, 200);
    expect(json.alreadySigned).toBe(false);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Parent Test");
    // A REAL signature is dated — only derived on-file copies are not.
    expect(row.waiverSignedAt).not.toBeNull();

    const rows = await liabilityRowsFor(childId);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(defaultOrg.organizationId);
    expect(rows[0].signedByUserId).toBe(parentUserId);
    expect(rows[0].signedByName).toBe("Parent Test");
    expect(rows[0].status).toBe("granted");
    expect(rows[0].expiresAt).not.toBeNull();
    // ip/UA come from THIS request's context, never the body.
    expect(rows[0].userAgent).toBe("annual-waiver-dropin-test/1.0");

    // ...and the row it just wrote now satisfies the annual predicate. Clear
    // the booking's local flag so a second request gets PAST the per-row
    // idempotency check — i.e. a genuinely SECOND signing event on a row that
    // carries no signature, by a person who is now covered. That is the case
    // the annual gate used to swallow; it is now recorded, because the record
    // follows the signature and not the coverage.
    await getDb()
      .update(dropInBookings)
      .set({ waiverSigned: false, waiverSignedAt: null, waiverSignedBy: null })
      .where(eq(dropInBookings.id, bookingId));

    const again = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test Again" }),
    });
    expect((await expectJson(again, 200)).alreadySigned).toBe(false);
    expect(await liabilityRowsFor(childId)).toHaveLength(2);

    const [reRow] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(reRow.waiverSignedBy).toBe("Parent Test Again");
    expect(reRow.waiverSignedAt).not.toBeNull();
  });

  /**
   * GUARDIAN ASSENT SENTENCE (spec M). A booking with a `family_member_id`
   * is a CHILD booking, so the waiver card must show — and the record must
   * quote — the guardian sentence naming the child, not the generic adult
   * accept line. The consents row's `notes` folds `consentText` in as
   * `text=<sentence>` (see recordLiabilityWaiver); asserting the substring
   * there proves the canonical audit log agrees with the booking's own
   * denormalized copy, not just one or the other.
   */
  it("(c) records the guardian assent sentence naming the child — matches what the card renders", async () => {
    const cookie = await getParentCookie();
    const childId = await newChild("GuardianSentence");
    const bookingId = await insertChildBooking(childId);

    const [child] = await getDb()
      .select({ firstName: familyMembers.firstName, lastName: familyMembers.lastName })
      .from(familyMembers)
      .where(eq(familyMembers.id, childId));
    const expectedText = waiverAssentSentence(
      "guardian",
      `${child.firstName} ${child.lastName}`.trim(),
    );

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    const json = await expectJson(res, 200);
    expect(json.alreadySigned).toBe(false);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverConsentVariant).toBe("guardian");
    expect(row.waiverConsentText).toBe(expectedText);
    // Never the generic adult line — that would be quoting words the child
    // booking's card never showed.
    expect(row.waiverConsentText).not.toBe(DROPIN_WAIVER_ACCEPT_LABEL);

    const rows = await liabilityRowsFor(childId);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toContain(`text=${expectedText}`);
    expect(rows[0].notes).toContain("variant=guardian");
  });

  /**
   * ADULT regression: an adult drop-in booking (no `family_member_id`) keeps
   * the generic accept line unchanged — this endpoint's own doc says
   * familyMemberId is only ever set on child bookings, so this is the
   * "everyone else" branch the guardian sentence must not have touched.
   */
  it("(d) an ADULT booking (no family_member_id) still records the generic accept line", async () => {
    const cookie = await getParentCookie();
    const ctx = await freeSessionInDefaultOrg();
    const bookRes = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    const bookJson = await expectJson(bookRes, 200);

    const res = await apiFetch(`/api/dropin/bookings/${bookJson.bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    await expectJson(res, 200);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookJson.bookingId));
    expect(row.waiverConsentVariant).toBe("adult");
    expect(row.waiverConsentText).toBe(DROPIN_WAIVER_ACCEPT_LABEL);
  });

  /**
   * DISPLAY side of the same rule. `GET /api/dropin/sessions/:id` powers the
   * session page's "one more step before you play" WaiverCard, which keyed
   * only off the per-BOOKING `waiverSigned` flag — false on every new row,
   * including one whose participant signed a fortnight ago at another door.
   * The card therefore asked a covered family for a signature the POST above
   * would immediately short-circuit. `bookingWaiverOnFile` is the endpoint
   * answering the SAME predicate so the two surfaces cannot disagree.
   */
  describe("GET /api/dropin/sessions/:id — bookingWaiverOnFile", () => {
    /** The session id an inserted child booking belongs to (the detail
     *  endpoint is per-session, so the test needs both ids). */
    async function insertChildBookingWithSession(
      familyMemberId: string,
    ): Promise<{ bookingId: string; sessionId: string }> {
      const ctx = await freeSessionInDefaultOrg();
      const [booking] = await getDb()
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: parentUserId,
          familyMemberId,
          status: "confirmed",
          source: "online_booking",
          paymentMethod: "card_online",
          amountPaidCents: 0,
          waiverSigned: false,
        })
        .returning();
      return { bookingId: booking.id, sessionId: ctx.sessionId };
    }

    it("reports true for an unsigned booking whose participant is covered", async () => {
      const cookie = await getParentCookie();
      const childId = await newChild("DisplayOnFile");
      await insertLiabilityConsent(childId, 30);
      const { sessionId } = await insertChildBookingWithSession(childId);

      const res = await apiFetch(`/api/dropin/sessions/${sessionId}`, { cookie });
      const json = await expectJson(res, 200);
      expect(json.bookingWaiverSigned).toBe(false);
      expect(json.bookingWaiverOnFile).toBe(true);
    });

    it("reports false for an unsigned booking whose participant is NOT covered", async () => {
      const cookie = await getParentCookie();
      const childId = await newChild("DisplayAsk");
      const { sessionId } = await insertChildBookingWithSession(childId);

      const res = await apiFetch(`/api/dropin/sessions/${sessionId}`, { cookie });
      const json = await expectJson(res, 200);
      expect(json.bookingWaiverSigned).toBe(false);
      // Fails toward ASKING — the card still renders.
      expect(json.bookingWaiverOnFile).toBe(false);
    });

    it("returns the participant id + name for a child booking (powers the guardian sentence)", async () => {
      const cookie = await getParentCookie();
      const childId = await newChild("DisplayName");
      const { sessionId } = await insertChildBookingWithSession(childId);

      const [child] = await getDb()
        .select({ firstName: familyMembers.firstName, lastName: familyMembers.lastName })
        .from(familyMembers)
        .where(eq(familyMembers.id, childId));

      const res = await apiFetch(`/api/dropin/sessions/${sessionId}`, { cookie });
      const json = await expectJson(res, 200);
      expect(json.bookingFamilyMemberId).toBe(childId);
      expect(json.bookingFamilyMemberName).toBe(
        `${child.firstName} ${child.lastName}`.trim(),
      );
    });

    it("reports the ACTUAL bookingPaymentMethod (e.g. pack_credit) distinct from the live quote", async () => {
      const cookie = await getParentCookie();
      const childId = await newChild("PackCreditBadge");
      const ctx = await freeSessionInDefaultOrg();
      const [booking] = await getDb()
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: parentUserId,
          familyMemberId: childId,
          status: "confirmed",
          source: "online_booking",
          paymentMethod: "pack_credit",
          amountPaidCents: 0,
          waiverSigned: false,
        })
        .returning();

      const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
      const json = await expectJson(res, 200);
      expect(json.bookingId).toBe(booking.id);
      expect(json.bookingPaymentMethod).toBe("pack_credit");
    });

    it("reports false for an ADULT booking (no participant row to check)", async () => {
      const cookie = await getParentCookie();
      const ctx = await freeSessionInDefaultOrg();
      const res0 = await apiFetch("/api/dropin/bookings", {
        method: "POST",
        cookie,
        body: JSON.stringify({ sessionId: ctx.sessionId }),
      });
      await expectJson(res0, 200);

      const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
      const json = await expectJson(res, 200);
      // An adult drop-in has no `family_members` row for a person-scoped
      // consent to hang on — the same limitation the POST documents. The
      // card keeps asking, exactly as before this field existed.
      expect(json.bookingWaiverSigned).toBe(false);
      expect(json.bookingWaiverOnFile).toBe(false);
    });
  });
});

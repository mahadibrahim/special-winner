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

  it("(a) waiver on file → alreadySigned, row stamped 'On file', NO signature date, NO new consent", async () => {
    const cookie = await getParentCookie();
    const childId = await newChild("OnFile");
    await insertLiabilityConsent(childId, 30);
    const bookingId = await insertChildBooking(childId);

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);
    expect(json.alreadySigned).toBe(true);

    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // Load-bearing: a dated derived row would self-renew the legacy window.
    expect(row.waiverSignedAt).toBeNull();

    // The on-file branch is a READ — it appends nothing to the audit log.
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
    // the booking's local flag so the request gets PAST the per-row
    // idempotency check: what stops a second audit row here is the annual
    // gate (`recordLiabilityWaiver` is append-only and does not dedupe), and
    // that is what this half asserts.
    await getDb()
      .update(dropInBookings)
      .set({ waiverSigned: false, waiverSignedAt: null, waiverSignedBy: null })
      .where(eq(dropInBookings.id, bookingId));

    const again = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Test" }),
    });
    expect((await expectJson(again, 200)).alreadySigned).toBe(true);
    expect(await liabilityRowsFor(childId)).toHaveLength(1);
  });
});

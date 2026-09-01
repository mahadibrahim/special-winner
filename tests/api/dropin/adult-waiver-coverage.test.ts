/**
 * Adult session-page coverage (waiver-ladder-followups, task 5 / spec L).
 *
 * The annual-waiver "born covered at creation" + "on-file at display" rules
 * were, until now, wired only for the CHILD paid make-up door (family_
 * member_id set). This suite extends the same rule to ADULT drop-in
 * bookings (`family_member_id` null): adults are never GATED — sign before
 * you PLAY, not before you pay, unchanged — but when the booker's own SELF
 * `family_members` row already carries a valid, org-scoped liability
 * waiver, the booking should be born already covered instead of asking
 * again post-payment:
 *
 *   - the FREE path (`createConfirmedBookingFreePath`, src/lib/dropin/
 *     booking.ts) stamps the row at insert time;
 *   - the PAID path (`POST /api/dropin/bookings`) stamps `waiver_on_file`
 *     into the checkout/PaymentIntent metadata, which the shared webhook
 *     fulfillment core (`fulfillDropInBookingPayment`) already turns into
 *     the same born-stamp for ANY booking regardless of family_member_id —
 *     proven directly here as a regression pin, no code changed there;
 *   - `GET /api/dropin/sessions/:id` reports `bookingWaiverOnFile: true` for
 *     an unsigned adult booking whose booker is covered (resolved through
 *     the booker's own self person, read-only), across all three ways the
 *     endpoint resolves "whose booking is this" — the signed-in owner and
 *     both guest PaymentIntent/Checkout-session fallbacks.
 *
 * Fixtures are DEDICATED, throwaway adult accounts — never the shared
 * parent test account, whose own coverage state is load-bearing for other
 * suites (see waiver-sign.test.ts's existing adult case, which relies on
 * that account having NO self waiver on file). Self-cleaning in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import { familyMembers } from "@/lib/db/schema/registrations";
import { hashPassword } from "@/lib/auth/password";
import { WAIVER_ON_FILE_ATTRIBUTION, WAIVER_VALID_DAYS } from "@/lib/consents/liability";
import { handleDropInBookingPayment } from "@/lib/stripe/handle-dropin-booking-payment";
import { apiFetch, getAuthCookie, expectJson } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

// Same Stripe-configured gate every other paid-flow suite uses (see
// tests/api/classes/paid-makeup.test.ts).
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;
const stripe = stripeConfigured ? new Stripe(process.env.STRIPE_SECRET_KEY!) : null;

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_PASSWORD = "TestAdultWaiver123!";

let defaultOrg: { organizationId: string; venueId: string };

const createdUserIds: string[] = [];
const createdFamilyMemberIds: string[] = [];

beforeAll(async () => {
  defaultOrg = await resolveDefaultOrgForHttpTests();
});

afterAll(async () => {
  if (createdUserIds.length === 0) return;
  const db = getDb();
  // Order: consents/bookings first (no FK dependency issue either way, but
  // explicit), then users — family_members.self_user_id is ON DELETE
  // CASCADE, so deleting the user sweeps its self row for free.
  if (createdFamilyMemberIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, createdFamilyMemberIds));
  }
  await db.delete(dropInBookings).where(inArray(dropInBookings.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
});

const freeSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 0,
    memberRateCents: 0,
  });

const paidSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 1500,
    memberRateCents: 1500,
  });

/** A dedicated adult account whose OWN self person carries a valid,
 *  org-scoped liability waiver (signed 30 days ago, well inside the
 *  365-day window). */
async function createCoveredAdult(
  label: string,
): Promise<{ userId: string; cookie: string; familyMemberId: string }> {
  const db = getDb();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `adult-waiver-covered-${label}-${stamp}@t.example`.toLowerCase();
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, firstName: "AdultCovered", lastName: label, emailVerified: true })
    .returning();
  createdUserIds.push(user.id);

  const [fm] = await db
    .insert(familyMembers)
    .values({ selfUserId: user.id, firstName: "AdultCovered", lastName: label })
    .returning();
  createdFamilyMemberIds.push(fm.id);

  const signedAt = new Date(Date.now() - 30 * DAY_MS);
  await db.insert(consents).values({
    familyMemberId: fm.id,
    organizationId: defaultOrg.organizationId,
    type: "liability",
    status: "granted",
    signedByUserId: user.id,
    signedByName: `Adult Covered ${label}`,
    signedAt,
    expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
  });

  const cookie = await getAuthCookie(email, TEST_PASSWORD);
  return { userId: user.id, cookie, familyMemberId: fm.id };
}

/** A dedicated adult account with NO self person / waiver at all — the
 *  "everyone else" baseline this whole suite must leave unchanged. */
async function createUncoveredAdult(label: string): Promise<{ userId: string; cookie: string }> {
  const db = getDb();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `adult-waiver-uncovered-${label}-${stamp}@t.example`.toLowerCase();
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, firstName: "AdultUncovered", lastName: label, emailVerified: true })
    .returning();
  createdUserIds.push(user.id);
  const cookie = await getAuthCookie(email, TEST_PASSWORD);
  return { userId: user.id, cookie };
}

async function bookingRow(bookingId: string) {
  const [row] = await getDb().select().from(dropInBookings).where(eq(dropInBookings.id, bookingId));
  return row;
}

describe("Adult drop-in — FREE path born-covered stamp (createConfirmedBookingFreePath)", () => {
  it("a covered adult's free booking is BORN on-file stamped", async () => {
    const { cookie } = await createCoveredAdult("FreeBorn");
    const ctx = await freeSessionInDefaultOrg();

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    const json = await expectJson(res, 200);
    expect(json.paymentRequired).toBe(false);

    const row = await bookingRow(json.bookingId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // Load-bearing: a dated derived copy would let this booking renew the
    // very window it was derived from (hasValidLiabilityWaiver's legacy
    // fallback accepts any DATED signed row).
    expect(row.waiverSignedAt).toBeNull();
  });

  it("an uncovered adult's free booking is born UNSIGNED — unchanged", async () => {
    const { cookie } = await createUncoveredAdult("FreeUncovered");
    const ctx = await freeSessionInDefaultOrg();

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    const json = await expectJson(res, 200);

    const row = await bookingRow(json.bookingId);
    expect(row.waiverSigned).toBe(false);
    expect(row.waiverSignedBy).toBeNull();
    expect(row.waiverSignedAt).toBeNull();
  });
});

describe("Adult drop-in — PAID path on-file metadata (POST /api/dropin/bookings)", () => {
  itWithStripe("stamps waiver_on_file when the booker's self waiver is valid", async () => {
    const { cookie } = await createCoveredAdult("PaidBorn");
    const ctx = await paidSessionInDefaultOrg();

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const stripeSession = await stripe!.checkout.sessions.retrieve(body.checkoutSessionId);
    expect(stripeSession.metadata?.waiver_on_file).toBe("1");
  });

  itWithStripe("does not stamp when the booker has no waiver on file", async () => {
    const { cookie } = await createUncoveredAdult("PaidUncovered");
    const ctx = await paidSessionInDefaultOrg();

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const stripeSession = await stripe!.checkout.sessions.retrieve(body.checkoutSessionId);
    expect(stripeSession.metadata?.waiver_on_file ?? "").toBe("");
  });
});

describe("Adult drop-in — fulfillment core reads waiver_on_file with no family_member_id (regression)", () => {
  it("births a confirmed adult booking on-file stamped from webhook metadata alone", async () => {
    const ctx = await createTestDropInSession({ capacity: 14 });
    const [user] = await getDb()
      .insert(users)
      .values({
        email: `adult-waiver-fulfill-${Date.now()}-${Math.random()}@t.example`,
        firstName: "Fulfill",
        lastName: "Adult",
      })
      .returning();
    createdUserIds.push(user.id);

    const result = await handleDropInBookingPayment({
      id: `pi_test_${Math.random().toString(36).slice(2)}`,
      object: "payment_intent",
      amount: 1500,
      amount_received: 1500,
      currency: "usd",
      status: "succeeded",
      receipt_email: null,
      metadata: {
        type: "dropin_booking_embedded",
        session_id: ctx.sessionId,
        user_id: user.id,
        payment_method: "card_online",
        membership_id: "",
        organization_id: ctx.organizationId,
        waiver_signed_at: "",
        waiver_name: "",
        referral_source: "",
        brand: "aspire",
        // No family_member_id — this is the adult drop-in shape.
        waiver_on_file: "1",
      },
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("processed");

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].familyMemberId).toBeNull();
    expect(rows[0].waiverSigned).toBe(true);
    expect(rows[0].waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    expect(rows[0].waiverSignedAt).toBeNull();
  });
});

describe("GET /api/dropin/sessions/:id — adult bookingWaiverOnFile", () => {
  /** Insert an unsigned adult booking directly, bypassing the free-path
   *  born-stamp above, so these cases isolate the DISPLAY-side derivation. */
  async function insertUnsignedAdultBooking(
    userId: string,
    sessionId: string,
    extra: Partial<typeof dropInBookings.$inferInsert> = {},
  ) {
    const [booking] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId,
        userId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        waiverSigned: false,
        ...extra,
      })
      .returning();
    return booking;
  }

  it("reports true for an unsigned adult booking whose booker is covered", async () => {
    const { userId, cookie } = await createCoveredAdult("DisplayOnFile");
    const ctx = await freeSessionInDefaultOrg();
    await insertUnsignedAdultBooking(userId, ctx.sessionId);

    const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
    const json = await expectJson(res, 200);
    expect(json.bookingWaiverSigned).toBe(false);
    expect(json.bookingWaiverOnFile).toBe(true);
  });

  it("reports false for an unsigned adult booking whose booker is NOT covered", async () => {
    const { userId, cookie } = await createUncoveredAdult("DisplayAsk");
    const ctx = await freeSessionInDefaultOrg();
    await insertUnsignedAdultBooking(userId, ctx.sessionId);

    const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
    const json = await expectJson(res, 200);
    expect(json.bookingWaiverSigned).toBe(false);
    // Fails toward ASKING — the card still renders.
    expect(json.bookingWaiverOnFile).toBe(false);
  });

  it("resolves coverage through the GUEST PaymentIntent capability — no login session", async () => {
    // An inline-payment guest gets no session cookie (account-takeover
    // prevention — see the endpoint's own doc comment), so this exercises
    // the bookingUserId plumbing through the payment_intent fallback branch
    // rather than the signed-in owner branch above.
    const { userId } = await createCoveredAdult("DisplayGuestPi");
    const ctx = await freeSessionInDefaultOrg();
    const paymentIntentId = `pi_adult_waiver_display_${Math.random().toString(36).slice(2)}`;
    await insertUnsignedAdultBooking(userId, ctx.sessionId, {
      stripePaymentIntentId: paymentIntentId,
      amountPaidCents: 1500,
    });

    const res = await apiFetch(
      `/api/dropin/sessions/${ctx.sessionId}?payment_intent=${paymentIntentId}`,
    );
    const json = await expectJson(res, 200);
    expect(json.bookingWaiverSigned).toBe(false);
    expect(json.bookingWaiverOnFile).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
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

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const sessionStart = new Date(todayStart.getTime() + 3 * 3_600_000);
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

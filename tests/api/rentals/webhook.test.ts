import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { handleFieldRentalCheckoutComplete } from "@/lib/stripe/handle-field-rental-checkout-complete";
import { handleFieldRentalWalkUpPayment } from "@/lib/stripe/handle-field-rental-walkup-payment";
import { createRentalHold } from "@/lib/rentals/booking";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

// A distinct calendar DAY per test run, far in the future. A random component
// is added so parallel CI jobs starting at the same millisecond still get
// distinct days and avoid slot collisions.
// Per-run base date, kept inside the 4-digit-year range so toISOString()
// doesn't produce a `+`-prefixed extended-year string that pg rejects.
// 10 years × 365 days = ~3650 distinct days; with 3 fields × multiple
// hours per run that's enormous slot space — collision-free in practice.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

function slot(hourOfDay: number, durationHours: number) {
  const startsAt = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + durationHours * 3_600_000);
  return { startsAt, endsAt };
}

const UNIQUE_PI = `pi_test_rental_${Date.now()}`;

describe("handleFieldRentalCheckoutComplete", () => {
  it("processes a pending_payment rental and flips it to confirmed", async () => {
    // Create a hold row
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 3,
      ...slot(9, 1),
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 8000,
      renterUserId: null,
      renterName: "Webhook Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 4,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: true,
      waiverSignedBy: "Webhook Test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) throw new Error("hold creation failed");

    const rentalId = hold.rental.id;

    // Call the handler
    const result = await handleFieldRentalCheckoutComplete({
      metadata: { type: "field_rental", rental_id: rentalId },
      payment_intent: UNIQUE_PI,
      amount_total: 8000,
    } as unknown as Stripe.Checkout.Session);

    expect(result.status).toBe("processed");
    if (result.status !== "processed") throw new Error("handler did not process");
    expect(result.rentalId).toBe(rentalId);
    expect(result.paidCents).toBe(8000);

    // Re-fetch and assert DB state
    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));

    expect(row).toBeDefined();
    expect(row!.status).toBe("confirmed");
    expect(row!.paymentStatus).toBe("paid");
    expect(row!.amountPaidCents).toBe(8000);
    expect(row!.stripePaymentIntentId).toBe(UNIQUE_PI);
    expect(row!.paymentExpiresAt).toBeNull();
  });

  it("is idempotent — second call returns skipped", async () => {
    // Create a fresh hold, confirm it via the handler, then call again — expect skipped.
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 3,
      ...slot(11, 1),
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 9000,
      renterUserId: null,
      renterName: "Idempotency Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 2,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: true,
      waiverSignedBy: "Idempotency Test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) throw new Error("hold creation failed");

    const rentalId = hold.rental.id;
    const pi = `pi_test_idem_${Date.now()}`;

    const fakeSession = {
      metadata: { type: "field_rental", rental_id: rentalId },
      payment_intent: pi,
      amount_total: 9000,
    } as unknown as Stripe.Checkout.Session;

    // First call — should process
    const first = await handleFieldRentalCheckoutComplete(fakeSession);
    expect(first.status).toBe("processed");

    // Second call — should skip (already confirmed)
    const second = await handleFieldRentalCheckoutComplete(fakeSession);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("already confirmed");
  });

  it("returns skipped when metadata has no rental_id", async () => {
    const result = await handleFieldRentalCheckoutComplete({
      metadata: {},
      payment_intent: "pi_noop",
      amount_total: 0,
    } as unknown as Stripe.Checkout.Session);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toBe("missing rental_id metadata");
  });

  it("returns skipped when rental_id does not exist in the database", async () => {
    const result = await handleFieldRentalCheckoutComplete({
      metadata: { type: "field_rental", rental_id: "00000000-0000-0000-0000-000000000000" },
      payment_intent: "pi_notfound",
      amount_total: 5000,
    } as unknown as Stripe.Checkout.Session);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("not found");
  });
});

describe("handleFieldRentalWalkUpPayment", () => {
  it("happy path: flips pending_payment hold to confirmed", async () => {
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 5,
      ...slot(14, 1),
      source: "admin_created",
      paymentMethod: "card_present",
      amountDueCents: 7500,
      renterUserId: null,
      renterName: "Walk-Up Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 3,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) throw new Error("hold creation failed");

    const rentalId = hold.rental.id;
    const fakePiId = `pi_test_walkup_${Date.now()}`;

    const fakePI = {
      id: fakePiId,
      metadata: { type: "field_rental_walk_up", rental_id: rentalId },
      amount_received: 7500,
      amount: 7500,
    } as unknown as Stripe.PaymentIntent;

    const result = await handleFieldRentalWalkUpPayment(fakePI);
    expect(result.status).toBe("processed");
    if (result.status !== "processed") throw new Error("handler did not process");
    expect(result.rentalId).toBe(rentalId);
    expect(result.paidCents).toBe(7500);

    // Re-fetch and assert DB state
    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));

    expect(row).toBeDefined();
    expect(row!.status).toBe("confirmed");
    expect(row!.paymentStatus).toBe("paid");
    expect(row!.amountPaidCents).toBe(7500);
    expect(row!.stripePaymentIntentId).toBe(fakePiId);
    expect(row!.paymentExpiresAt).toBeNull();
  });

  it("idempotency: second call on confirmed rental returns skipped", async () => {
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 5,
      ...slot(16, 1),
      source: "admin_created",
      paymentMethod: "card_present",
      amountDueCents: 6000,
      renterUserId: null,
      renterName: "Idempotency Walk-Up Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 2,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) throw new Error("hold creation failed");

    const rentalId = hold.rental.id;
    const fakePiId = `pi_test_walkup_idem_${Date.now()}`;

    const fakePI = {
      id: fakePiId,
      metadata: { type: "field_rental_walk_up", rental_id: rentalId },
      amount_received: 6000,
      amount: 6000,
    } as unknown as Stripe.PaymentIntent;

    const first = await handleFieldRentalWalkUpPayment(fakePI);
    expect(first.status).toBe("processed");

    const second = await handleFieldRentalWalkUpPayment(fakePI);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("already confirmed");
  });

  it("returns skipped when metadata has no rental_id", async () => {
    const result = await handleFieldRentalWalkUpPayment({
      id: "pi_noop",
      metadata: {},
      amount_received: 0,
      amount: 0,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toBe("missing rental_id metadata");
  });

  it("returns skipped when rental_id does not exist in the database", async () => {
    const result = await handleFieldRentalWalkUpPayment({
      id: "pi_notfound",
      metadata: { type: "field_rental_walk_up", rental_id: "00000000-0000-0000-0000-000000000000" },
      amount_received: 5000,
      amount: 5000,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("not found");
  });

  it("cancelled-guard: late Terminal success does not flip a cancelled rental", async () => {
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 5,
      ...slot(18, 1),
      source: "admin_created",
      paymentMethod: "card_present",
      amountDueCents: 5500,
      renterUserId: null,
      renterName: "Cancelled Guard Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 1,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) throw new Error("hold creation failed");

    const rentalId = hold.rental.id;

    // Directly cancel the row to simulate a refund/cancel before Terminal succeeds
    await getDb()
      .update(fieldRentals)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(fieldRentals.id, rentalId));

    const result = await handleFieldRentalWalkUpPayment({
      id: `pi_test_walkup_cancel_${Date.now()}`,
      metadata: { type: "field_rental_walk_up", rental_id: rentalId },
      amount_received: 5500,
      amount: 5500,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("already cancelled");
  });
});

import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { handleFieldRentalCheckoutComplete } from "@/lib/stripe/handle-field-rental-checkout-complete";
import { createRentalHold } from "@/lib/rentals/booking";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

// A distinct calendar DAY per test run, far in the future. Date.now() spread
// across millions of distinct days means consecutive runs never reuse a slot.
const RUN_DAY_OFFSET = Date.now() % 3_000_000;
const RUN_BASE_UTC = Date.UTC(2030, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

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
    } as never);

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
    // Re-use the same rental_id that was confirmed in the previous test.
    // We need to look it up by querying for the confirmed row we created.
    // Instead, create a fresh hold, confirm it, then call again.
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
    } as never;

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
    } as never);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toBe("missing rental_id metadata");
  });
});

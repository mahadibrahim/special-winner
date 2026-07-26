import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { handleDropInBookingPayment } from "@/lib/stripe/handle-dropin-booking-payment";
import { createTestDropInSession } from "../../utils/dropin-helpers";

/**
 * Build a realistic fake PaymentIntent — the shape `createDropInPaymentIntent`
 * (src/lib/dropin/create-checkout.ts) mints for the inline deferred Payment
 * Element flow. Carries the same fulfillment metadata contract as the hosted
 * Checkout Session, with `type: "dropin_booking_embedded"`. The handler only
 * reads a small subset of fields; the rest are unsafe-cast away.
 */
function makeEmbeddedBookingIntent(o: {
  paymentIntentId: string;
  dropInSessionId: string;
  userId: string;
  amountCents: number;
  /** Omit the waiver metadata (empty-string wire encoding) — the current
   *  sign-before-you-play producers, which defer the waiver to after
   *  payment. Default true = legacy producer shape with a signature. */
  withWaiver?: boolean;
}): Stripe.PaymentIntent {
  const withWaiver = o.withWaiver ?? true;
  return {
    id: o.paymentIntentId,
    object: "payment_intent",
    amount: o.amountCents,
    amount_received: o.amountCents,
    currency: "usd",
    status: "succeeded",
    receipt_email: "embedded-booker@t.example",
    metadata: {
      type: "dropin_booking_embedded",
      session_id: o.dropInSessionId,
      user_id: o.userId,
      payment_method: "card_online",
      membership_id: "",
      organization_id: "00000000-0000-0000-0000-000000000000",
      waiver_signed_at: withWaiver ? new Date().toISOString() : "",
      waiver_name: withWaiver ? "Embedded Booker" : "",
      referral_source: "",
      brand: "aspire",
    },
  } as unknown as Stripe.PaymentIntent;
}

async function insertTestUser() {
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `dropin-embedded-wh-${Date.now()}-${Math.random()}@t.example`,
      firstName: "Embedded",
      lastName: "Booker",
    })
    .returning();
  return u;
}

describe("handleDropInBookingPayment (dropin_booking_embedded)", () => {
  it("creates a confirmed booking row from a succeeded embedded PaymentIntent", async () => {
    const ctx = await createTestDropInSession({ capacity: 14 });
    const user = await insertTestUser();

    const result = await handleDropInBookingPayment(
      makeEmbeddedBookingIntent({
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        dropInSessionId: ctx.sessionId,
        userId: user.id,
        amountCents: 1500,
      }),
    );

    expect(result.status).toBe("processed");

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].userId).toBe(user.id);
    expect(rows[0].amountPaidCents).toBe(1500);
    expect(rows[0].paymentMethod).toBe("card_online");
    expect(rows[0].waiverSigned).toBe(true);
    expect(rows[0].waiverSignedBy).toBe("Embedded Booker");
  });

  it("creates an UNSIGNED confirmed booking when waiver metadata is absent (sign-before-you-play)", async () => {
    const ctx = await createTestDropInSession({ capacity: 14 });
    const user = await insertTestUser();

    const result = await handleDropInBookingPayment(
      makeEmbeddedBookingIntent({
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        dropInSessionId: ctx.sessionId,
        userId: user.id,
        amountCents: 1500,
        withWaiver: false,
      }),
    );

    expect(result.status).toBe("processed");

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].waiverSigned).toBe(false);
    expect(rows[0].waiverSignedAt).toBeNull();
    expect(rows[0].waiverSignedBy).toBeNull();
  });

  it("is idempotent on double delivery — one booking row, second delivery skipped", async () => {
    const ctx = await createTestDropInSession({ capacity: 14 });
    const user = await insertTestUser();
    const paymentIntentId = `pi_test_${Math.random().toString(36).slice(2)}`;

    const intent = makeEmbeddedBookingIntent({
      paymentIntentId,
      dropInSessionId: ctx.sessionId,
      userId: user.id,
      amountCents: 1500,
    });

    const first = await handleDropInBookingPayment(intent);
    expect(first.status).toBe("processed");

    // Redelivery of the same PaymentIntent (e.g. the stripe_events ledger
    // failed open) — the per-row PI dedupe must skip without a second insert.
    const second = await handleDropInBookingPayment(intent);
    expect(second.status).toBe("skipped");
    if (second.status === "skipped") {
      expect(second.reason).toContain(paymentIntentId);
    }

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].stripePaymentIntentId).toBe(paymentIntentId);
  });
});

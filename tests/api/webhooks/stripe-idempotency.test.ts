import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { stripeEvents } from "@/lib/db/schema/stripe-events";
import { handleStripeEvent } from "@/lib/stripe/handle-stripe-event";
import { createTestDropInSession } from "../../utils/dropin-helpers";

/**
 * Build a checkout.session.completed event whose drop-in handler is
 * guaranteed to throw: the `user_id` metadata points at a non-existent
 * user, so the dropInBookings insert hits a foreign-key violation.
 */
function makeFailingDropinEvent(o: {
  eventId: string;
  dropInSessionId: string;
}): Stripe.Event {
  return {
    id: o.eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${Math.random().toString(36).slice(2)}`,
        object: "checkout.session",
        amount_total: 1500,
        currency: "usd",
        payment_intent: `pi_test_${Math.random().toString(36).slice(2)}`,
        payment_status: "paid",
        status: "complete",
        mode: "payment",
        metadata: {
          type: "dropin_booking",
          session_id: o.dropInSessionId,
          user_id: "00000000-0000-0000-0000-000000000000",
          payment_method: "card_online",
          membership_id: "",
          waiver_signed_at: new Date().toISOString(),
          waiver_name: "Test",
        },
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent — webhook idempotency ledger", () => {
  it("releases the event claim when the handler throws, so a retry can reprocess", async () => {
    const ctx = await createTestDropInSession({ capacity: 14 });
    const eventId = `evt_test_${Math.random().toString(36).slice(2)}`;
    const event = makeFailingDropinEvent({
      eventId,
      dropInSessionId: ctx.sessionId,
    });

    // First delivery: the handler throws (user_id FK violation).
    await expect(handleStripeEvent(event)).rejects.toThrow();

    // The claim must have been released — no ledger row left behind — so
    // Stripe's automatic retry will reprocess instead of being deduped away.
    const rows = await getDb()
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId));
    expect(rows).toHaveLength(0);
  });
});

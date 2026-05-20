import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { handleDropInCheckoutComplete } from "@/lib/stripe/handle-dropin-checkout-complete";
import { createTestDropInSession } from "../../utils/dropin-helpers";

/**
 * Build a realistic fake drop-in Checkout Session — the shape the booking
 * endpoint stamps onto a paid-path Checkout Session. The handler only reads
 * a small subset of fields; the rest are unsafe-cast away.
 */
function makeDropinCheckoutSession(o: {
  checkoutSessionId: string;
  paymentIntentId: string;
  dropInSessionId: string;
  userId: string;
  amountTotal: number;
}): Stripe.Checkout.Session {
  return {
    id: o.checkoutSessionId,
    object: "checkout.session",
    amount_total: o.amountTotal,
    currency: "usd",
    payment_intent: o.paymentIntentId,
    payment_status: "paid",
    status: "complete",
    mode: "payment",
    metadata: {
      type: "dropin_booking",
      session_id: o.dropInSessionId,
      user_id: o.userId,
      payment_method: "card_online",
      membership_id: "",
      waiver_signed_at: new Date().toISOString(),
      waiver_name: "Test Booker",
    },
  } as unknown as Stripe.Checkout.Session;
}

async function insertTestUser() {
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `dropin-wh-${Date.now()}-${Math.random()}@t.example`,
      firstName: "Drop",
      lastName: "Booker",
    })
    .returning();
  return u;
}

describe("handleDropInCheckoutComplete", () => {
  it("creates a confirmed booking row from a completed paid Checkout Session", async () => {
    // Mirrors the prod scenario: a paid pickup session (default helper gives
    // teamCount 2 / colors orange,black) booked for the first time.
    const ctx = await createTestDropInSession({ capacity: 14 });
    const user = await insertTestUser();

    const result = await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_${Math.random().toString(36).slice(2)}`,
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        dropInSessionId: ctx.sessionId,
        userId: user.id,
        amountTotal: 1500,
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
  });
});

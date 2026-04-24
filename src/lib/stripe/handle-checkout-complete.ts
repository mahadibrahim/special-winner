import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, payments } from "@/lib/db/schema";

/**
 * Handle a `checkout.session.completed` event for a registration payment.
 * Returns an object describing what happened so callers/tests can assert.
 */
export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = session.metadata?.registrationId;
  const paymentType = session.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  const amountPaid = session.amount_total || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const paymentTypeValue =
    registration.registrationType === "deposit" ? "deposit" : "full";

  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent as string,
    metadata: {
      customerEmail: session.customer_email,
      stripeCheckoutSessionId: session.id,
    },
  });

  return { status: "processed", registrationId, paidCents: amountPaid };
}

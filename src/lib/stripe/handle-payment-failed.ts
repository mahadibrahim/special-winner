import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  locations,
  users,
} from "@/lib/db/schema";
import { sendPaymentFailedEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";

/**
 * Handler for `payment_intent.payment_failed` webhook events.
 *
 * Scope (intentionally minimal — see launch-readiness scope):
 *   1. Flip the registration's payment status to `failed` so the parent
 *      sees a clear "retry payment" CTA on their dashboard.
 *   2. Send a single "payment failed" email pointing them back to the
 *      registration to retry. No dunning, no exponential backoff —
 *      that's post-launch.
 */
export async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string }
> {
  const registrationId = paymentIntent.metadata?.registrationId;
  if (!registrationId) {
    return { status: "skipped", reason: "no registrationId in payment intent metadata" };
  }

  const db = getDb();

  const [row] = await db
    .select({
      registration: registrations,
      familyMember: familyMembers,
      season: seasons,
      program: programs,
      location: locations,
      user: users,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .where(eq(registrations.id, registrationId));

  if (!row) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  // Don't downgrade a registration that was already paid (e.g. an earlier
  // delivery succeeded and a later one failed for an unrelated reason).
  if (row.registration.paymentStatus === "paid") {
    return { status: "skipped", reason: "registration already paid" };
  }

  // Note: the `payment_status` enum doesn't include `failed`, so we leave
  // the existing status (`unpaid` / `deposit_paid`) intact. The signal to
  // the parent is the email + the dashboard retry CTA. We bump updatedAt
  // and mark the registration so admin views can surface failed attempts.
  await db
    .update(registrations)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  const failureMessage =
    paymentIntent.last_payment_error?.message ??
    "Your card was declined. Please try a different payment method.";

  // Brand from Stripe metadata (set at charge creation time, PR #168).
  // Fall back through registration.brand → default aspire.
  const brand = normalizeBrand(
    paymentIntent.metadata?.brand ?? row.registration.brand,
  );
  const appUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;

  // Fire-and-forget email — don't block webhook ack.
  sendPaymentFailedEmail({
    userId: row.user.id,
    organizationId: row.location.organizationId ?? undefined,
    registrationId,
    parentEmail: row.user.email,
    parentName: row.user.firstName || row.user.email.split("@")[0],
    childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
    programName: row.program.name,
    seasonName: row.season.name,
    failureMessage,
    retryUrl: `${appUrl}/dashboard?retry=${registrationId}`,
    brand,
  }).catch((err) =>
    console.error("[stripe webhook] payment-failed email send failed:", err),
  );

  return { status: "processed", registrationId };
}

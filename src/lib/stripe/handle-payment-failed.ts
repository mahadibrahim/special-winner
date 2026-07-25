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
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";

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

  // Record the failure durably. `failed` is distinct from `unpaid`
  // (never-attempted), so the dashboard shows a clear retry CTA and admin/
  // reconciliation can tell a failed payment apart from an abandoned row.
  // The guard above already skips an already-paid registration.
  await db
    .update(registrations)
    .set({
      paymentStatus: "failed",
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

  // Wizard-free retry: land the parent directly on the pay-balance page for
  // THIS registration — no re-running the registration flow. Guests have no
  // password, so a plain /dashboard link would bounce to /signin; mint a
  // login magic-link that redirects to the pay-balance page instead.
  const payBalancePath = `/dashboard/registrations/${registrationId}/pay-balance`;
  let retryUrl = `${appUrl}${payBalancePath}`;
  if (row.user.passwordHash === null) {
    try {
      const link = await createMagicLink({
        userId: row.registration.registeredByUserId,
        organizationId: row.location.organizationId ?? undefined,
        purpose: "login",
        // This link is emailed for asynchronous decline recovery — the parent
        // may open it hours later, so override the 15-min interactive-login
        // default with a wide window (matches re-registration campaigns).
        expiresInSeconds: 72 * 60 * 60,
        purposeContext: { redirectTo: payBalancePath },
        deliveredChannel: "email",
        deliveredTo: row.user.email,
      });
      retryUrl = buildMagicLinkUrl(link.token, { origin: appUrl });
    } catch (err) {
      console.error("[stripe webhook] payment-failed magic-link mint failed:", err);
    }
  }

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
    retryUrl,
    brand,
  }).catch((err) =>
    console.error("[stripe webhook] payment-failed email send failed:", err),
  );

  return { status: "processed", registrationId };
}

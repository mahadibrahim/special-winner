import type Stripe from "stripe";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  seasons,
  programs,
  locations,
  familyMembers,
  users,
  sports,
  teamInvitees,
} from "@/lib/db/schema";
import {
  sendRegistrationConfirmationEmail,
  sendMagicLinkLoginEmail,
  sendPaymentReceiptEmail,
} from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/notifications/await-dispatch";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { sendOpsPing } from "@/lib/ops/ping";

// Handles `payment_intent.succeeded` for registration payments. Mirrors
// the prior Checkout-Session flow exactly, just sourced from a PI.
export async function handleRegistrationPaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = paymentIntent.metadata?.registrationId;
  const paymentType = paymentIntent.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  // Dedupe by stripePaymentIntentId — webhook router already uses a
  // stripe_events ledger; this is a defense-in-depth check against a
  // re-delivered event slipping past it.
  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .orderBy(asc(payments.createdAt))
    .limit(1);

  if (existingPayment.length > 0) {
    return {
      status: "skipped",
      reason: `duplicate delivery for payment intent ${paymentIntent.id}`,
    };
  }

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  // The card surcharge is added to the PaymentIntent total at checkout (see
  // createPaymentIntent), so amount_received = registration base + surcharge.
  // The surcharge is a pass-through processing fee, NOT part of the
  // registration price or org revenue. Credit only the base toward the
  // registration balance — crediting the gross inflates registration
  // .amountPaidCents, which corrupts the money trail, the SUM(amountCents)
  // revenue reports, and the admin-refund cap (it caps at amountPaidCents).
  // It would also over-credit a partial/balance payment toward amountDueCents.
  // The surcharge is preserved in the payment row metadata for reconciliation.
  const grossPaidCents = paymentIntent.amount_received || paymentIntent.amount || 0;
  const surchargeCents =
    Number.parseInt(paymentIntent.metadata?.surcharge_cents ?? "", 10) || 0;
  const amountPaid = Math.max(0, grossPaidCents - surchargeCents);
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const newAmountDue = Math.max(0, registration.amountDueCents - amountPaid);

  // latest_charge maps the PaymentIntent to its Charge — required so
  // charge.dispute.* events can find this payment row by stripeChargeId.
  const stripeChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ?? null;

  let paymentTypeValue: "deposit" | "balance" | "full";
  if (registration.amountPaidCents > 0) {
    paymentTypeValue = "balance";
  } else if (registration.registrationType === "deposit") {
    paymentTypeValue = "deposit";
  } else {
    paymentTypeValue = "full";
  }

  // The registration status update and the payment-ledger insert must land
  // together — a partial write (status flipped but no payment row, or vice
  // versa) corrupts the money trail. Wrap both in one transaction.
  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
        amountPaidCents: newAmountPaid,
        amountDueCents: newAmountDue,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    await tx.insert(payments).values({
      registrationId,
      userId: registration.registeredByUserId,
      amountCents: amountPaid,
      paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
      status: "succeeded",
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId,
      metadata: {
        customerEmail: paymentIntent.receipt_email,
        ...(surchargeCents > 0 ? { surchargeCents } : {}),
      },
    });
  });

  // If this registration is a teammate paying their captain-assigned share,
  // flip the invitee row to "paid" so the captain backstop no longer counts it
  // among the unpaid shares. Defensive: a missing/failed update must not affect
  // the (already-committed) registration fulfillment. Only mark paid once the
  // registration is fully settled.
  if (isFullyPaid) {
    try {
      await db
        .update(teamInvitees)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(teamInvitees.registrationId, registrationId));
    } catch (err) {
      console.error("[stripe webhook] team invitee paid-flip failed:", err);
    }
  }

  try {
    const [row] = await db
      .select({
        user: users,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        location: locations,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(registrations.id, registrationId));

    if (row) {
      await awaitEmailSend("registration confirmation", () => sendRegistrationConfirmationEmail({
        userId: row.user.id,
        organizationId: row.location.organizationId ?? undefined,
        registrationId,
        parentEmail: row.user.email,
        parentName: row.user.firstName || row.user.email.split("@")[0],
        childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
        programName: row.program.name,
        seasonName: row.season.name,
        startDate: row.season.startDate,
        endDate: row.season.endDate,
        scheduleNotes: row.season.scheduleNotes || undefined,
        locationName: row.location.name,
        locationAddress:
          [row.location.addressLine1, row.location.city, row.location.state]
            .filter(Boolean)
            .join(", ") || undefined,
        amountDueCents: registration.amountDueCents,
        paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
        registrationStatus: "confirmed",
        brand: normalizeBrand(paymentIntent.metadata?.brand),
      }), { registrationId });

      await awaitEmailSend("payment receipt", () => sendPaymentReceiptEmail({
        userId: row.user.id,
        organizationId: row.location.organizationId ?? undefined,
        registrationId,
        parentEmail: row.user.email,
        parentName: row.user.firstName || row.user.email.split("@")[0],
        childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
        programName: row.program.name,
        seasonName: row.season.name,
        amountPaidCents: amountPaid,
        paymentType: paymentTypeValue,
        remainingBalanceCents: isFullyPaid ? undefined : newAmountDue,
        receiptNumber: paymentIntent.id.replace(/^pi_(test_)?/, "").slice(0, 12),
        brand: normalizeBrand(paymentIntent.metadata?.brand),
      }), { registrationId });

      await sendOpsPing(row.location.organizationId, {
        kind: "registration_paid",
        brand: registration.brand,
        // Use the payment intent id, not registration.id: a registration can
        // receive multiple payments (deposit, then balance/installments) and
        // each one is a distinct payment event — keying on registration.id
        // would dedupe every payment after the first against the initial ping.
        eventId: paymentIntent.id,
        label: `${row.familyMember.firstName} ${row.familyMember.lastName} · ${row.program.name} ${row.season.name}`,
        amountCents: amountPaid,
      });

      if (paymentIntent.metadata?.via_guest_checkout === "true") {
        try {
          const link = await createMagicLink({
            userId: registration.registeredByUserId,
            organizationId: row.location.organizationId ?? undefined,
            purpose: "login",
            purposeContext: { redirectTo: `/dashboard?welcome=${registrationId}` },
            deliveredChannel: "email",
            deliveredTo: row.user.email,
          });
          await awaitEmailSend("guest magic-link login", () => sendMagicLinkLoginEmail({
            userId: row.user.id,
            organizationId: row.location.organizationId ?? undefined,
            parentEmail: row.user.email,
            parentName: row.user.firstName || row.user.email.split("@")[0],
            // No request context in a webhook — derive the redemption domain
            // from the charge's brand metadata so a gosoccerone.com purchase
            // signs the customer in on gosoccerone.com.
            magicLinkUrl: buildMagicLinkUrl(link.token, {
              origin: originForBrand(paymentIntent.metadata?.brand),
            }),
            expiresIn: "15 minutes",
            programName: row.program.name,
            childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
            seasonName: row.season.name,
            brand: normalizeBrand(paymentIntent.metadata?.brand),
          }), { registrationId });
        } catch (err) {
          console.error("[stripe webhook] magic-link mint failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[stripe webhook] email payload build failed:", err);
  }

  // Server-side ad conversions (GA4 Measurement Protocol + Meta CAPI) — the
  // ad-blocker / iOS-ATP-resistant twins of the browser pixel fire on
  // /payment/return, deduped against it by the PaymentIntent id. Item context
  // needs a JOIN, so this runs after the fulfillment transaction. Skip the
  // work entirely when the charge carries no ad attribution.
  const md = paymentIntent.metadata ?? {};
  const hasAttribution =
    md.ga_client_id || md.fbclid || md._fbc || md._fbp;
  if (hasAttribution) {
    try {
      const [itemRow] = await db
        .select({
          seasonId: seasons.id,
          seasonName: seasons.name,
          programName: programs.name,
          sportName: sports.name,
          seasonPriceCents: seasons.priceCents,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .where(eq(registrations.id, registrationId));

      if (itemRow) {
        let paymentTypeForTracking: "deposit" | "balance" | "full";
        if (registration.amountPaidCents > 0) {
          paymentTypeForTracking = "balance";
        } else if (registration.registrationType === "deposit") {
          paymentTypeForTracking = "deposit";
        } else {
          paymentTypeForTracking = "full";
        }

        const itemName = `${itemRow.programName} - ${itemRow.seasonName}`;
        fireServerPurchaseConversions({
          metadata: paymentIntent.metadata,
          eventId: paymentIntent.id,
          valueCents: amountPaid,
          brand: normalizeBrand(paymentIntent.metadata?.brand),
          email: paymentIntent.receipt_email,
          ga4Items: [
            {
              id: itemRow.seasonId,
              name: itemName,
              category: itemRow.sportName,
              priceCents: itemRow.seasonPriceCents,
            },
          ],
          ga4PaymentType: paymentTypeForTracking,
          ga4Coupon: paymentIntent.metadata?.discount_code,
          contentIds: [itemRow.seasonId],
          contentName: itemName,
          contentCategory: "registration",
        });
      }
    } catch (err) {
      console.error("[stripe webhook] purchase-conversion item JOIN failed:", err);
    }
  }

  capturePaymentCompleted({
    distinctId: registration.registeredByUserId,
    kind: "registration",
    amountCents: amountPaid,
    brand: normalizeBrand(paymentIntent.metadata?.brand),
    metadata: {
      registration_id: registrationId,
      payment_type: paymentTypeValue,
      fully_paid: isFullyPaid,
      via_guest_checkout: paymentIntent.metadata?.via_guest_checkout === "true",
    },
  });

  return { status: "processed", registrationId, paidCents: amountPaid };
}

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
} from "@/lib/db/schema";
import {
  sendRegistrationConfirmationEmail,
  sendMagicLinkLoginEmail,
  sendPaymentReceiptEmail,
} from "@/lib/email/send";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendPurchaseEvent } from "@/lib/analytics/ga4-measurement-protocol";

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

  const amountPaid = paymentIntent.amount_received || paymentIntent.amount || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const newAmountDue = Math.max(0, registration.amountDueCents - amountPaid);

  let paymentTypeValue: "deposit" | "balance" | "full";
  if (registration.amountPaidCents > 0) {
    paymentTypeValue = "balance";
  } else if (registration.registrationType === "deposit") {
    paymentTypeValue = "deposit";
  } else {
    paymentTypeValue = "full";
  }

  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      amountDueCents: newAmountDue,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: paymentIntent.id,
    metadata: {
      customerEmail: paymentIntent.receipt_email,
    },
  });

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
      sendRegistrationConfirmationEmail({
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
      }).catch((err) => console.error("[stripe webhook] email send failed:", err));

      sendPaymentReceiptEmail({
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
      }).catch((err) =>
        console.error("[stripe webhook] receipt email send failed:", err),
      );

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
          sendMagicLinkLoginEmail({
            userId: row.user.id,
            organizationId: row.location.organizationId ?? undefined,
            parentEmail: row.user.email,
            parentName: row.user.firstName || row.user.email.split("@")[0],
            magicLinkUrl: buildMagicLinkUrl(link.token),
            expiresIn: "15 minutes",
            programName: row.program.name,
            childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
            seasonName: row.season.name,
          }).catch((err) =>
            console.error("[stripe webhook] magic-link email send failed:", err),
          );
        } catch (err) {
          console.error("[stripe webhook] magic-link mint failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[stripe webhook] email payload build failed:", err);
  }

  const gaClientId = paymentIntent.metadata?.ga_client_id;
  if (gaClientId) {
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

        sendPurchaseEvent({
          clientId: gaClientId,
          transactionId: paymentIntent.id,
          valueCents: amountPaid,
          currency: "USD",
          paymentType: paymentTypeForTracking,
          coupon: paymentIntent.metadata?.discount_code,
          items: [
            {
              id: itemRow.seasonId,
              name: `${itemRow.programName} - ${itemRow.seasonName}`,
              category: itemRow.sportName,
              priceCents: itemRow.seasonPriceCents,
            },
          ],
        }).catch((err) => console.error("[stripe webhook] GA4 MP send failed:", err));
      }
    } catch (err) {
      console.error("[stripe webhook] GA4 item-context JOIN failed:", err);
    }
  }

  return { status: "processed", registrationId, paidCents: amountPaid };
}

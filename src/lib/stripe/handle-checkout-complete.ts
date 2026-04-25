import type Stripe from "stripe";
import { eq, sql, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  seasons,
  programs,
  locations,
  familyMembers,
  users,
} from "@/lib/db/schema";
import { sendRegistrationConfirmationEmail, sendMagicLinkLoginEmail } from "@/lib/email/send";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";

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

  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      sql`${payments.metadata} ->> 'stripeCheckoutSessionId' = ${session.id}`
    )
    .orderBy(asc(payments.createdAt))
    .limit(1);

  if (existingPayment.length > 0) {
    return {
      status: "skipped",
      reason: `duplicate delivery for session ${session.id}`,
    };
  }

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

  // Fire-and-forget email (don't block webhook ack on email delivery).
  // We await the JOIN to build the payload but let the send itself run async.
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

      // Guest-checkout users get a magic-link sign-in alongside the receipt.
      // Triggered by the metadata flag set by /api/payments/create-checkout
      // when called from /api/registrations/guest-checkout (Task 6).
      if (session.metadata?.via_guest_checkout === "true") {
        try {
          const link = await createMagicLink({
            userId: registration.registeredByUserId,
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

  return { status: "processed", registrationId, paidCents: amountPaid };
}

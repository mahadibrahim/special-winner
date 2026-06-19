import { eq, and, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  discountCodes,
  discountUsages,
  users,
  locations,
} from "@/lib/db/schema";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe/client";
import {
  createConnectCheckoutSession,
  getOrganizationPaymentConfig,
} from "@/lib/stripe/connect";
import type { PaymentMethodCategory } from "@/lib/payments/surcharge";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckoutResult =
  | {
      kind: "stripe_session"
      clientSecret: string
      sessionId: string
      surchargeCents: number
    }
  | { kind: "paid_zero"; registrationId: string };

// baseUrl currently unused in Phase 1 (no redirect URLs); retained for Phase 2 magic-link emails
export interface CreateCheckoutForRegistrationInput {
  db: ReturnType<typeof getDb>;
  registrationId: string;
  userId: string;
  baseUrl: string;
  discountCode?: string;
  extraMetadata?: Record<string, string>;
  /** "bank" → ACH only, no surcharge. "card" → card + wallets + BNPL with surcharge. */
  paymentMethodCategory?: PaymentMethodCategory;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export async function createCheckoutForRegistration(
  input: CreateCheckoutForRegistrationInput,
): Promise<CheckoutResult> {
  const {
    db,
    registrationId,
    userId,
    baseUrl,
    discountCode,
    extraMetadata,
    paymentMethodCategory,
  } = input;
  void baseUrl;

  // 1. Stripe must be configured
  if (!isStripeConfigured()) {
    throw new CheckoutError(503, "Payment processing is not configured");
  }

  // 2. Look up registration (scoped to userId) with related data, including
  //    the owning organization (joined via location) so we can decide whether
  //    to route the payment through Stripe Connect.
  const [result] = await db
    .select({
      registration: registrations,
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
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.registeredByUserId, userId),
      ),
    );

  if (!result) {
    throw new CheckoutError(404, "Registration not found");
  }

  const { registration, familyMember, season, program, location } = result;

  // 3. Already paid?
  if (registration.paymentStatus === "paid") {
    throw new CheckoutError(400, "Registration is already paid");
  }

  // 4. Calculate base amount due
  let amountDue = registration.amountDueCents - registration.amountPaidCents;
  if (amountDue <= 0) {
    throw new CheckoutError(400, "No payment required");
  }

  // 5. Validate and redeem the discount code in one transaction.
  //    The discount row is locked FOR UPDATE so two concurrent checkouts
  //    can't both pass the maxUses / maxUsesPerUser check and both redeem.
  //    (The previous code validated with a plain SELECT, then inserted the
  //    usage row + incremented usedCount later, outside any transaction — a
  //    TOCTOU window that let a limited code be over-redeemed under load.)
  //
  //    Known limitation, unchanged here: redemption happens at checkout
  //    creation, so an abandoned (never-paid) checkout still consumes a use.
  //    Moving redemption to payment-success is a separate, larger change.
  let discountAmountCents = 0;
  let appliedDiscountCodeId: string | null = null;

  if (discountCode) {
    const redeemed = await db.transaction(async (tx) => {
      const [found] = await tx
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.code, discountCode.toUpperCase()))
        .for("update");
      if (!found) return null;

      const now = new Date();
      const baseValid =
        found.active &&
        (!found.startsAt || now >= found.startsAt) &&
        (!found.expiresAt || now <= found.expiresAt) &&
        (!found.maxUses || found.usedCount < found.maxUses) &&
        (!found.seasonId || found.seasonId === season.id) &&
        (!found.minPurchaseCents || amountDue >= found.minPurchaseCents);
      if (!baseValid) return null;

      if (found.maxUsesPerUser) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(discountUsages)
          .where(
            and(
              eq(discountUsages.discountCodeId, found.id),
              eq(discountUsages.userId, userId),
            ),
          );
        if (count >= found.maxUsesPerUser) return null;
      }

      let amount = 0;
      if (found.discountType === "percentage") {
        amount = Math.round((amountDue * found.discountValue) / 10000);
        if (found.maxDiscountCents && amount > found.maxDiscountCents) {
          amount = found.maxDiscountCents;
        }
      } else {
        amount = Math.min(found.discountValue, amountDue);
      }

      // Redeem under the same row lock that gated the caps above.
      await tx.insert(discountUsages).values({
        discountCodeId: found.id,
        userId,
        registrationId,
        discountAmountCents: amount,
      });
      await tx
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, found.id));

      return { id: found.id, amount };
    });

    if (redeemed) {
      appliedDiscountCodeId = redeemed.id;
      discountAmountCents = redeemed.amount;
      amountDue = Math.max(0, amountDue - discountAmountCents);
    }
  }

  // 6. Zero after discount — mark paid and return. (Usage was already
  //    recorded in the redemption transaction above.)
  if (amountDue <= 0) {
    await db
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountDueCents: registration.amountDueCents - discountAmountCents,
        amountPaidCents: registration.amountDueCents - discountAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    return { kind: "paid_zero", registrationId };
  }

  // 7. Discount applied but amount > 0 — update amountDueCents. (Usage was
  //    already recorded in the redemption transaction above.)
  if (appliedDiscountCodeId && discountAmountCents > 0) {
    await db
      .update(registrations)
      .set({
        amountDueCents: registration.amountDueCents - discountAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));
  }

  // 8. Look up the registration owner's email via a proper Drizzle join
  const [userRow] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));

  if (!userRow) {
    throw new CheckoutError(500, "Could not resolve user email for checkout");
  }
  const customerEmail = userRow.email;

  // 9. Decide platform-direct vs Stripe Connect based on the org config.
  //     Connect is used when the org has a connected account and onboarding
  //     is complete; otherwise the payment goes to the platform account
  //     (HQ direct or franchise-not-yet-onboarded).
  const orgId = location.organizationId;
  const paymentConfig = orgId
    ? await getOrganizationPaymentConfig(orgId)
    : null;

  // Stamp the resolving org onto the payment metadata so every registration
  // charge is brand-attributable in the Stripe dashboard (Aspire vs SoccerOne)
  // without a DB join — mirrors how drop-in/rentals/memberships already do it.
  const merged = {
    registrationId,
    type: "registration_payment",
    organization_id: orgId ?? "",
    ...(appliedDiscountCodeId && discountCode
      ? { discount_code: discountCode.toUpperCase() }
      : {}),
    ...(extraMetadata ?? {}),
  };

  if (
    paymentConfig?.useConnect &&
    paymentConfig.destinationAccountId
  ) {
    const session = await createConnectCheckoutSession({
      amountCents: amountDue,
      destinationAccountId: paymentConfig.destinationAccountId,
      applicationFeePercent: paymentConfig.applicationFeePercent,
      customerEmail,
      productName: `${program.name} - ${season.name}`,
      productDescription: `Registration for ${familyMember.firstName} ${familyMember.lastName}`,
      metadata: merged,
      paymentMethodCategory,
    });

    if (!session) {
      throw new CheckoutError(500, "Failed to create Connect checkout session");
    }
    return {
      kind: "stripe_session",
      clientSecret: session.clientSecret,
      sessionId: session.id,
      surchargeCents: session.surchargeCents,
    };
  }

  // Platform-direct (HQ, or franchise without a connected account yet).
  // Carry organization_id through so the platform-account charge is
  // brand-attributable too, matching the Connect path above.
  const session = await createCheckoutSession({
    registrationId,
    seasonName: `${program.name} - ${season.name}`,
    playerName: `${familyMember.firstName} ${familyMember.lastName}`,
    amountCents: amountDue,
    customerEmail,
    extraMetadata: { ...(extraMetadata ?? {}), organization_id: orgId ?? "" },
    paymentMethodCategory,
  });

  if (!session) {
    throw new CheckoutError(500, "Failed to create checkout session");
  }

  return {
    kind: "stripe_session",
    clientSecret: session.clientSecret,
    sessionId: session.id,
    surchargeCents: session.surchargeCents,
  };
}

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

  // 5. Validate and apply discount code if provided
  let discountAmountCents = 0;
  let appliedDiscountCode: typeof discountCodes.$inferSelect | null = null;

  if (discountCode) {
    const [foundDiscount] = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.code, discountCode.toUpperCase()));

    if (foundDiscount) {
      const now = new Date();
      const isValid =
        foundDiscount.active &&
        (!foundDiscount.startsAt || now >= foundDiscount.startsAt) &&
        (!foundDiscount.expiresAt || now <= foundDiscount.expiresAt) &&
        (!foundDiscount.maxUses || foundDiscount.usedCount < foundDiscount.maxUses) &&
        (!foundDiscount.seasonId || foundDiscount.seasonId === season.id) &&
        (!foundDiscount.minPurchaseCents || amountDue >= foundDiscount.minPurchaseCents);

      if (isValid) {
        // Check per-user limit
        let userCanUse = true;
        if (foundDiscount.maxUsesPerUser) {
          const userUsageCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(discountUsages)
            .where(
              and(
                eq(discountUsages.discountCodeId, foundDiscount.id),
                eq(discountUsages.userId, userId),
              ),
            );

          if (userUsageCount[0].count >= foundDiscount.maxUsesPerUser) {
            userCanUse = false;
          }
        }

        if (userCanUse) {
          // Calculate discount amount
          if (foundDiscount.discountType === "percentage") {
            discountAmountCents = Math.round((amountDue * foundDiscount.discountValue) / 10000);
            if (
              foundDiscount.maxDiscountCents &&
              discountAmountCents > foundDiscount.maxDiscountCents
            ) {
              discountAmountCents = foundDiscount.maxDiscountCents;
            }
          } else {
            discountAmountCents = Math.min(foundDiscount.discountValue, amountDue);
          }

          appliedDiscountCode = foundDiscount;
          amountDue = Math.max(0, amountDue - discountAmountCents);
        }
      }
    }
  }

  // 6. Zero after discount — mark paid and return
  if (amountDue <= 0) {
    if (appliedDiscountCode) {
      await db.insert(discountUsages).values({
        discountCodeId: appliedDiscountCode.id,
        userId,
        registrationId,
        discountAmountCents,
      });

      await db
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, appliedDiscountCode.id));
    }

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

  // 7. Discount applied but amount > 0 — record usage and update amountDueCents
  if (appliedDiscountCode && discountAmountCents > 0) {
    await db.insert(discountUsages).values({
      discountCodeId: appliedDiscountCode.id,
      userId,
      registrationId,
      discountAmountCents,
    });

    await db
      .update(discountCodes)
      .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
      .where(eq(discountCodes.id, appliedDiscountCode.id));

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

  const merged = {
    registrationId,
    type: "registration_payment",
    ...(appliedDiscountCode ? { discount_code: appliedDiscountCode.code } : {}),
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
      // createConnectCheckoutSession doesn't expose surcharge yet; recompute
      // locally so the API contract stays uniform.
      surchargeCents: paymentMethodCategory
        ? (await import("@/lib/payments/surcharge")).computeSurchargeCents(
            amountDue,
            paymentMethodCategory,
          )
        : 0,
    };
  }

  // Platform-direct (HQ, or franchise without a connected account yet)
  const session = await createCheckoutSession({
    registrationId,
    seasonName: `${program.name} - ${season.name}`,
    playerName: `${familyMember.firstName} ${familyMember.lastName}`,
    amountCents: amountDue,
    customerEmail,
    extraMetadata,
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

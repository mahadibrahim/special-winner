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
} from "@/lib/db/schema";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe/client";

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
  | { kind: "stripe_session"; checkoutUrl: string; sessionId: string }
  | { kind: "paid_zero"; registrationId: string };

export interface CreateCheckoutForRegistrationInput {
  db: ReturnType<typeof getDb>;
  registrationId: string;
  userId: string;
  baseUrl: string;
  discountCode?: string;
  extraMetadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export async function createCheckoutForRegistration(
  input: CreateCheckoutForRegistrationInput,
): Promise<CheckoutResult> {
  const { db, registrationId, userId, baseUrl, discountCode, extraMetadata } = input;

  // 1. Stripe must be configured
  if (!isStripeConfigured()) {
    throw new CheckoutError(503, "Payment processing is not configured");
  }

  // 2. Look up registration (scoped to userId) with related data
  const [result] = await db
    .select({
      registration: registrations,
      familyMember: familyMembers,
      season: seasons,
      program: programs,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.registeredByUserId, userId),
      ),
    );

  if (!result) {
    throw new CheckoutError(404, "Registration not found");
  }

  const { registration, familyMember, season, program } = result;

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

  // 9. Build URLs
  const successUrl = `${baseUrl}/dashboard?payment=success&registration=${registrationId}`;
  const cancelUrl = `${baseUrl}/register/${season.id}?payment=cancelled`;

  // 10. Create Stripe checkout session
  const session = await createCheckoutSession({
    registrationId,
    seasonName: `${program.name} - ${season.name}`,
    playerName: `${familyMember.firstName} ${familyMember.lastName}`,
    amountCents: amountDue,
    customerEmail,
    successUrl,
    cancelUrl,
    extraMetadata,
  });

  if (!session || !session.url) {
    throw new CheckoutError(500, "Failed to create checkout session");
  }

  return { kind: "stripe_session", checkoutUrl: session.url, sessionId: session.id };
}

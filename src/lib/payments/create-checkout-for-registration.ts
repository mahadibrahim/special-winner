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
import {
  getAccountCreditBalanceCents,
  redeemAccountCredit,
} from "@/lib/payments/account-credit";

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
      creditAppliedCents: number
    }
  | { kind: "paid_zero"; registrationId: string; creditAppliedCents: number };

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
  /** Apply the user's account credit balance to this checkout. The client
   *  never supplies an amount — the server computes min(balance, amountDue)
   *  so over-apply is impossible by construction (mirrors discountCode: a
   *  code string, not an amount). */
  applyAccountCredit?: boolean;
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
    applyAccountCredit,
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
      // Registration owner's email, merged into the initial join instead of
      // a separate users.email lookup right before the Stripe redirect
      // (registrations.registeredByUserId === userId, already filtered by
      // the WHERE below, so this is the same row a standalone lookup by
      // userId would return).
      userEmail: users.email,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(users.id, registrations.registeredByUserId))
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.registeredByUserId, userId),
      ),
    );

  if (!result) {
    throw new CheckoutError(404, "Registration not found");
  }

  const { registration, familyMember, season, program, location, userEmail } = result;

  // Resolved early (moved up from where it's used for Stripe Connect
  // routing below) so account-credit redemption — which needs an
  // organizationId to scope the balance — can run after the discount step
  // and before the single zero-check.
  const orgId = location.organizationId;

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

  // 6. Apply account credit, after the discount step and before the single
  //    zero-check below. The server computes min(balance, amountDue) — the
  //    client only sends a boolean, so over-apply is impossible by
  //    construction. Redemption is recorded immediately (same known
  //    limitation as the discount-code redemption above: an abandoned,
  //    never-paid checkout still consumes the credit — accepted, matches
  //    existing discount-code behavior).
  let creditAppliedCents = 0;
  if (applyAccountCredit && amountDue > 0) {
    const balanceCents = await getAccountCreditBalanceCents(userId, orgId ?? "");
    const toApply = Math.min(balanceCents, amountDue);
    if (toApply > 0) {
      const redemption = await redeemAccountCredit({
        userId,
        organizationId: orgId ?? "",
        registrationId,
        amountCentsRequested: toApply,
      });
      creditAppliedCents = redemption.redeemedCents;
      amountDue = Math.max(0, amountDue - creditAppliedCents);
    }
  }

  // 7. Single zero-check — covers both "discount alone covered it" and
  //    "discount + credit covered it". Reuses the existing paid_zero comp
  //    path that 100%-off discount codes already use. (Discount/credit
  //    usage was already recorded in their respective transactions above.)
  if (amountDue <= 0) {
    // Zero-due via discount is legitimate (100%-off comps) but rare enough
    // to always leave a trail — the 2026-08-04 WFF incident ($25 code stored
    // as $2,500) produced exactly this shape and was only found by walking
    // discount_usages after a "paid but no receipt" report.
    if (discountAmountCents > 0) {
      console.warn(
        `[checkout] discount zeroed registration ${registrationId}: code=${input.discountCode ?? "?"} discounted=${discountAmountCents}c originalDue=${registration.amountDueCents}c credit=${creditAppliedCents}c`,
      );
    }
    await db
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountDueCents:
          registration.amountDueCents - discountAmountCents - creditAppliedCents,
        amountPaidCents:
          registration.amountDueCents - discountAmountCents - creditAppliedCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    return { kind: "paid_zero", registrationId, creditAppliedCents };
  }

  // Discount and/or credit applied but amount still > 0 — persist the
  // reduced amountDueCents.
  if ((appliedDiscountCodeId && discountAmountCents > 0) || creditAppliedCents > 0) {
    await db
      .update(registrations)
      .set({
        amountDueCents:
          registration.amountDueCents - discountAmountCents - creditAppliedCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));
  }

  // 8. Registration owner's email — resolved in the initial join above
  //    (registeredByUserId is a NOT NULL FK with onDelete: "restrict", so
  //    the join is guaranteed to have matched a users row here).
  const customerEmail = userEmail;

  // 9. Decide platform-direct vs Stripe Connect based on the org config.
  //     Connect is used when the org has a connected account and onboarding
  //     is complete; otherwise the payment goes to the platform account
  //     (HQ direct or franchise-not-yet-onboarded).
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
      creditAppliedCents,
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
    creditAppliedCents,
  };
}

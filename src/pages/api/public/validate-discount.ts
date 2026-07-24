import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { discountCodes, discountUsages } from "@/lib/db/schema";
import { eq, and, or, isNull, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

const validateDiscountSchema = z.object({
  code: z.string().min(1, "Code is required").toUpperCase(),
  seasonId: z.string().uuid().optional(),
  purchaseAmountCents: z.number().min(0).optional(),
  // NOTE: no client-supplied userId. The per-user usage cap is checked against
  // the authenticated session only (locals.user) — trusting a body userId let
  // a caller spoof/omit it to sidestep the per-user limit. Any userId in the
  // body is ignored (zod strips it).
});

// POST - Validate a discount code
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  try {
    const ip = clientAddress || "unknown";

    // Per-IP rate limit. Without it, a discount-code enumeration attack is
    // trivial (each request returns a clean valid/invalid signal). 30/min
    // is generous for a real user iterating on a checkout but slow enough
    // that brute-forcing a 6-character code space is impractical.
    const ipLimit = rateLimit(`validate-discount:${ip}`, 30, 60_000);
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfter ?? 60);
    }

    // Require organization context to prevent cross-tenant discount code leakage
    const organization = locals.organization;
    if (!organization) {
      return new Response(
        JSON.stringify({ valid: false, error: "Organization context required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const validation = validateDiscountSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { code, seasonId, purchaseAmountCents } = validation.data;
    // Per-user cap is keyed to the authenticated user, never a client value.
    const userId = locals.user?.id ?? null;

    // Find the discount code - filter by organization to prevent cross-tenant access
    const [discountCode] = await getDb()
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, code),
          eq(discountCodes.organizationId, organization.id)
        )
      );

    if (!discountCode) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid discount code" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if active
    if (!discountCode.active) {
      return new Response(
        JSON.stringify({ valid: false, error: "This discount code is no longer active" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check date validity
    const now = new Date();
    if (discountCode.startsAt && now < discountCode.startsAt) {
      return new Response(
        JSON.stringify({ valid: false, error: "This discount code is not yet active" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (discountCode.expiresAt && now > discountCode.expiresAt) {
      return new Response(
        JSON.stringify({ valid: false, error: "This discount code has expired" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check total usage limit
    if (discountCode.maxUses && discountCode.usedCount >= discountCode.maxUses) {
      return new Response(
        JSON.stringify({ valid: false, error: "This discount code has reached its usage limit" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check season restriction
    if (discountCode.seasonId && seasonId && discountCode.seasonId !== seasonId) {
      return new Response(
        JSON.stringify({ valid: false, error: "This discount code is not valid for this season" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check minimum purchase
    if (
      discountCode.minPurchaseCents &&
      purchaseAmountCents !== undefined &&
      purchaseAmountCents < discountCode.minPurchaseCents
    ) {
      const minPurchase = (discountCode.minPurchaseCents / 100).toFixed(2);
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Minimum purchase of $${minPurchase} required for this discount`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check per-user usage limit if userId provided
    if (userId && discountCode.maxUsesPerUser) {
      const userUsageCount = await getDb()
        .select({ count: sql<number>`count(*)` })
        .from(discountUsages)
        .where(
          and(
            eq(discountUsages.discountCodeId, discountCode.id),
            eq(discountUsages.userId, userId)
          )
        );

      if (userUsageCount[0].count >= discountCode.maxUsesPerUser) {
        return new Response(
          JSON.stringify({
            valid: false,
            error: "You have already used this discount code the maximum number of times",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Calculate discount amount if purchase amount provided
    let discountAmountCents: number | null = null;
    if (purchaseAmountCents !== undefined) {
      if (discountCode.discountType === "percentage") {
        // discountValue is stored as percentage * 100 (e.g., 1500 = 15%)
        discountAmountCents = Math.round((purchaseAmountCents * discountCode.discountValue) / 10000);
        // Apply max discount cap if set
        if (discountCode.maxDiscountCents && discountAmountCents > discountCode.maxDiscountCents) {
          discountAmountCents = discountCode.maxDiscountCents;
        }
      } else {
        // Fixed amount discount
        discountAmountCents = Math.min(discountCode.discountValue, purchaseAmountCents);
      }
    }

    // Return valid discount details (without exposing sensitive data)
    return new Response(
      JSON.stringify({
        valid: true,
        discount: {
          code: discountCode.code,
          description: discountCode.description,
          discountType: discountCode.discountType,
          discountValue: discountCode.discountValue,
          maxDiscountCents: discountCode.maxDiscountCents,
          minPurchaseCents: discountCode.minPurchaseCents,
          seasonId: discountCode.seasonId,
        },
        calculatedDiscount: discountAmountCents !== null ? {
          discountAmountCents,
          finalAmountCents: purchaseAmountCents! - discountAmountCents,
        } : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating discount code:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Failed to validate discount code" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

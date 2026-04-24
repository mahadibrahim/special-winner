import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, discountCodes, discountUsages } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe/client";
import { z } from "zod";

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
  discountCode: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    if (!isStripeConfigured()) {
      return new Response(JSON.stringify({ error: "Payment processing is not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { registrationId, discountCode } = validation.data;

    // Get registration with related data
    const [result] = await getDb()
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
          eq(registrations.registeredByUserId, user.id)
        )
      );

    if (!result) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { registration, familyMember, season, program } = result;

    // Check if already paid
    if (registration.paymentStatus === "paid") {
      return new Response(JSON.stringify({ error: "Registration is already paid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate base amount due
    let amountDue = registration.amountDueCents - registration.amountPaidCents;
    if (amountDue <= 0) {
      return new Response(JSON.stringify({ error: "No payment required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Apply discount if provided
    let discountAmountCents = 0;
    let appliedDiscountCode: typeof discountCodes.$inferSelect | null = null;

    if (discountCode) {
      // Find and validate the discount code
      const [foundDiscount] = await getDb()
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
            const userUsageCount = await getDb()
              .select({ count: sql<number>`count(*)` })
              .from(discountUsages)
              .where(
                and(
                  eq(discountUsages.discountCodeId, foundDiscount.id),
                  eq(discountUsages.userId, user.id)
                )
              );

            if (userUsageCount[0].count >= foundDiscount.maxUsesPerUser) {
              userCanUse = false;
            }
          }

          if (userCanUse) {
            // Calculate discount amount
            if (foundDiscount.discountType === "percentage") {
              discountAmountCents = Math.round((amountDue * foundDiscount.discountValue) / 10000);
              if (foundDiscount.maxDiscountCents && discountAmountCents > foundDiscount.maxDiscountCents) {
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

    // If amount is now 0 after discount, mark as paid and return
    if (amountDue <= 0) {
      // Record discount usage if applicable
      if (appliedDiscountCode) {
        await getDb().insert(discountUsages).values({
          discountCodeId: appliedDiscountCode.id,
          userId: user.id,
          registrationId,
          discountAmountCents: discountAmountCents,
        });

        // Increment usage count
        await getDb()
          .update(discountCodes)
          .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
          .where(eq(discountCodes.id, appliedDiscountCode.id));
      }

      // Update registration as paid with reduced amount
      await getDb()
        .update(registrations)
        .set({
          paymentStatus: "paid",
          amountDueCents: registration.amountDueCents - discountAmountCents,
          amountPaidCents: registration.amountDueCents - discountAmountCents,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registrationId));

      return new Response(
        JSON.stringify({
          success: true,
          message: "Registration complete - no payment required after discount",
          discountApplied: discountAmountCents > 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // If a discount was applied, update the registration and record usage
    if (appliedDiscountCode && discountAmountCents > 0) {
      await getDb().insert(discountUsages).values({
        discountCodeId: appliedDiscountCode.id,
        userId: user.id,
        registrationId,
        discountAmountCents: discountAmountCents,
      });

      // Increment usage count
      await getDb()
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, appliedDiscountCode.id));

      // Update registration with reduced amount due
      await getDb()
        .update(registrations)
        .set({
          amountDueCents: registration.amountDueCents - discountAmountCents,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registrationId));
    }

    // Build URLs
    const baseUrl = url.origin;
    const successUrl = `${baseUrl}/dashboard?payment=success&registration=${registrationId}`;
    const cancelUrl = `${baseUrl}/register/${season.id}?payment=cancelled`;

    // Create Stripe checkout session
    const session = await createCheckoutSession({
      registrationId,
      seasonName: `${program.name} - ${season.name}`,
      playerName: `${familyMember.firstName} ${familyMember.lastName}`,
      amountCents: amountDue,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
    });

    if (!session) {
      return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);

    // Distinguish Stripe configuration problems from generic server errors so
    // the wizard can show parents something actionable instead of a naked 500.
    const e = error as { type?: string; message?: string };
    const stripeType =
      typeof e?.type === "string" && e.type.startsWith("Stripe") ? e.type : null;

    if (stripeType === "StripeAuthenticationError") {
      return new Response(
        JSON.stringify({
          error:
            "Payment processing is not configured correctly. Please contact support — your registration is saved and you won't be charged twice when payments come back online.",
          code: "stripe_auth_error",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    if (stripeType) {
      return new Response(
        JSON.stringify({
          error:
            "We couldn't start your payment. Please try again in a moment — your registration is saved.",
          code: "stripe_error",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error:
          "Something went wrong starting your payment. Your registration is saved; please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

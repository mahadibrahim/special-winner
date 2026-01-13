import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { registrations, familyMembers, seasons, programs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe/client";
import { z } from "zod";

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
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

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const { registrationId } = validation.data;

    // Get registration with related data
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

    // Calculate amount due
    const amountDue = registration.amountDueCents - registration.amountPaidCents;
    if (amountDue <= 0) {
      return new Response(JSON.stringify({ error: "No payment required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

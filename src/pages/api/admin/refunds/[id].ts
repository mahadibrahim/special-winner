import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, users, locations, payments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { sendRefundNotificationEmail } from "@/lib/email/send";

const refundActionSchema = z.object({
  action: z.enum(["approve", "deny"]),
  reason: z.string().optional(),
});

// POST - Approve or deny a refund request
export const POST: APIRoute = async (context) => {
  // Verify admin access
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Registration ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Parse request body
    const body = await context.request.json();
    const validation = refundActionSchema.safeParse(body);

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

    const { action, reason } = validation.data;

    // Get registration with related data - filter by organization
    const [registration] = await getDb()
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
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(eq(registrations.id, id), eq(locations.organizationId, orgContext.organizationId)));

    if (!registration) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if registration has a pending refund
    if (registration.registration.refundStatus !== "pending_approval") {
      return new Response(
        JSON.stringify({ error: "No pending refund for this registration" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const refundAmountCents = registration.registration.refundAmountCents || 0;

    // Get parent user info for email
    const [parentUser] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, registration.registration.registeredByUserId));

    // Get payment record to access Stripe payment intent ID
    const [payment] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.registrationId, id));

    const stripePaymentIntentId = payment?.stripePaymentIntentId;

    if (action === "approve") {
      // Process Stripe refund if configured and there's an amount to refund
      let stripeRefundId: string | null = null;

      if (refundAmountCents > 0 && stripePaymentIntentId) {
        if (!isStripeConfigured() || !stripe) {
          return new Response(
            JSON.stringify({ error: "Stripe not configured for refunds" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        try {
          const refund = await stripe.refunds.create({
            payment_intent: stripePaymentIntentId,
            amount: refundAmountCents,
            reason: "requested_by_customer",
            metadata: {
              registrationId: id,
              approvedBy: auth.user.id,
            },
          });

          stripeRefundId = refund.id;
        } catch (stripeError) {
          console.error("Stripe refund error:", stripeError);
          return new Response(
            JSON.stringify({
              error: "Failed to process Stripe refund",
              details: stripeError instanceof Error ? stripeError.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      // Update registration status
      const [updated] = await getDb()
        .update(registrations)
        .set({
          refundStatus: "processed",
          status: "refunded",
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, id))
        .returning();

      // Send approval email
      if (parentUser) {
        sendRefundNotificationEmail({
          userId: parentUser.id,
          registrationId: id,
          parentEmail: parentUser.email,
          parentName: parentUser.firstName || parentUser.email.split("@")[0],
          childName: `${registration.familyMember.firstName} ${registration.familyMember.lastName}`,
          programName: registration.program.name,
          seasonName: registration.season.name,
          refundAmountCents,
          refundStatus: "approved",
        }).catch((err) => console.error("Error sending refund approval email:", err));
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Refund approved and processed",
          registration: updated,
          refund: {
            amountCents: refundAmountCents,
            stripeRefundId,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      // Deny refund
      const [updated] = await getDb()
        .update(registrations)
        .set({
          refundStatus: "denied",
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, id))
        .returning();

      // Send denial email
      if (parentUser) {
        sendRefundNotificationEmail({
          userId: parentUser.id,
          registrationId: id,
          parentEmail: parentUser.email,
          parentName: parentUser.firstName || parentUser.email.split("@")[0],
          childName: `${registration.familyMember.firstName} ${registration.familyMember.lastName}`,
          programName: registration.program.name,
          seasonName: registration.season.name,
          refundAmountCents,
          refundStatus: "denied",
          denialReason: reason,
        }).catch((err) => console.error("Error sending refund denial email:", err));
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Refund denied",
          registration: updated,
          reason,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error processing refund action:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// GET - Get pending refund details
export const GET: APIRoute = async (context) => {
  // Verify admin access
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Registration ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Get registration with related data - filter by organization
    const [registration] = await getDb()
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
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(eq(registrations.id, id), eq(locations.organizationId, orgContext.organizationId)));

    if (!registration) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get parent user info
    const [parentUser] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, registration.registration.registeredByUserId));

    return new Response(
      JSON.stringify({
        registration: {
          id: registration.registration.id,
          status: registration.registration.status,
          refundStatus: registration.registration.refundStatus,
          refundAmountCents: registration.registration.refundAmountCents,
          amountPaidCents: registration.registration.amountPaidCents,
          cancelledAt: registration.registration.cancelledAt,
          cancelledReason: registration.registration.cancelledReason,
        },
        familyMember: {
          id: registration.familyMember.id,
          firstName: registration.familyMember.firstName,
          lastName: registration.familyMember.lastName,
        },
        season: {
          id: registration.season.id,
          name: registration.season.name,
          startDate: registration.season.startDate,
        },
        program: {
          id: registration.program.id,
          name: registration.program.name,
        },
        parent: parentUser || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching refund details:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

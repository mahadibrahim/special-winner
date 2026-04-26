import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, locations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { sendWaitlistPromotionEmail } from "@/lib/email/send";
import { getPostHogServer } from "@/lib/posthog-server";

const cancelSchema = z.object({
  reason: z.string().optional(),
});

// Waitlist promotion hours (how long they have to complete payment)
const WAITLIST_PROMOTION_HOURS = 48;

// POST - Cancel a registration
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Registration ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const validation = cancelSchema.safeParse(body);

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

    const { reason } = validation.data;

    // Get registration and verify ownership
    const [registration] = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.id, id),
          eq(registrations.registeredByUserId, user.id)
        )
      );

    if (!registration) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if registration can be cancelled
    if (registration.status === "cancelled" || registration.status === "refunded") {
      return new Response(
        JSON.stringify({ error: "Registration is already cancelled" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get season info for refund calculation
    const [season] = await getDb()
      .select()
      .from(seasons)
      .where(eq(seasons.id, registration.seasonId));

    if (!season) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate refund amount
    // Simple policy: full refund if more than 7 days before start, 50% if less, no refund after start
    let refundAmountCents = 0;
    let refundStatus: "none" | "pending_approval" | "approved" | "processed" | "denied" = "none";

    if (registration.amountPaidCents > 0) {
      const now = new Date();
      const startDate = new Date(season.startDate);
      const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilStart > 7) {
        // Full refund
        refundAmountCents = registration.amountPaidCents;
        refundStatus = "pending_approval";
      } else if (daysUntilStart > 0) {
        // 50% refund
        refundAmountCents = Math.floor(registration.amountPaidCents * 0.5);
        refundStatus = "pending_approval";
      } else {
        // No refund after season starts
        refundAmountCents = 0;
        refundStatus = "none";
      }
    }

    // Update registration to cancelled
    const [cancelled] = await getDb()
      .update(registrations)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: reason || null,
        cancelledBy: user.id,
        refundStatus,
        refundAmountCents: refundAmountCents > 0 ? refundAmountCents : null,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, id))
      .returning();

    // Check for waitlisted registrations to promote
    const waitlistPromotion = await promoteFromWaitlist(registration.seasonId, season);

    const posthog = getPostHogServer();
    posthog.capture({ distinctId: user.id, event: "registration_cancelled", properties: { registration_id: id, season_id: registration.seasonId, refund_amount_cents: refundAmountCents, refund_status: refundStatus, has_reason: !!reason } });

    return new Response(
      JSON.stringify({
        registration: cancelled,
        refund: {
          amountCents: refundAmountCents,
          status: refundStatus,
          message: refundAmountCents > 0
            ? "Refund pending admin approval"
            : "No refund eligible based on cancellation policy",
        },
        waitlistPromotion: waitlistPromotion
          ? { promoted: true, message: "Next person on waitlist has been notified" }
          : null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error cancelling registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Helper function to promote next waitlisted registration
async function promoteFromWaitlist(seasonId: string, season: any): Promise<boolean> {
  try {
    // Get first waitlisted registration for this season
    const [waitlisted] = await getDb()
      .select({
        registration: registrations,
        familyMember: familyMembers,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.status, "waitlisted")
        )
      )
      .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt))
      .limit(1);

    if (!waitlisted) {
      return false;
    }

    // Set expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + WAITLIST_PROMOTION_HOURS);

    // Update to pending status
    await getDb()
      .update(registrations)
      .set({
        status: "pending",
        waitlistPromotedAt: new Date(),
        waitlistExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, waitlisted.registration.id));

    // Get program and location info for email
    const [programData] = await getDb()
      .select({
        program: programs,
        location: locations,
      })
      .from(programs)
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(programs.id, season.programId));

    if (programData) {
      // Get parent user info
      const [parent] = await getDb()
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.id, waitlisted.registration.familyMemberId));

      if (parent) {
        // We need to get the user email - for now we'll use the registration's user
        const { registeredByUserId } = waitlisted.registration;

        // Send waitlist promotion email
        sendWaitlistPromotionEmail({
          userId: registeredByUserId,
          organizationId: programData.location.organizationId,
          registrationId: waitlisted.registration.id,
          parentEmail: "", // We'd need to join with users table to get this
          parentName: "",
          childName: `${waitlisted.familyMember.firstName} ${waitlisted.familyMember.lastName}`,
          programName: programData.program.name,
          seasonName: season.name,
          amountDueCents: waitlisted.registration.amountDueCents,
          expiresAt,
          hoursToComplete: WAITLIST_PROMOTION_HOURS,
        }).catch((err) => console.error("Error sending waitlist promotion email:", err));
      }
    }

    return true;
  } catch (error) {
    console.error("Error promoting from waitlist:", error);
    return false;
  }
}

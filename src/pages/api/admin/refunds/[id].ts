import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  users,
  locations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { sendRefundNotificationEmail } from "@/lib/email/send";
import { adminRefund } from "@/lib/payments/admin-refund";

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

    const childName = `${registration.familyMember.firstName} ${registration.familyMember.lastName}`;

    if (action === "approve") {
      const result = await adminRefund({
        registration: registration.registration,
        refundAmountCents,
        reason,
        adminUserId: auth.user.id,
        organizationId: orgContext.organizationId,
        childName,
        programName: registration.program.name,
        seasonName: registration.season.name,
      });

      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.error, details: result.details }),
          {
            status: result.status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Refund approved and processed",
          registration: result.registration,
          refund: {
            amountCents: refundAmountCents,
            stripeRefundId: result.stripeRefundId,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      // Deny refund — no Stripe call, just update + email.
      const [updated] = await getDb()
        .update(registrations)
        .set({
          refundStatus: "denied",
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, id))
        .returning();

      const [parentUser] = await getDb()
        .select()
        .from(users)
        .where(eq(users.id, registration.registration.registeredByUserId));

      if (parentUser) {
        sendRefundNotificationEmail({
          userId: parentUser.id,
          organizationId: orgContext.organizationId,
          registrationId: id,
          parentEmail: parentUser.email,
          parentName: parentUser.firstName || parentUser.email.split("@")[0],
          childName,
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

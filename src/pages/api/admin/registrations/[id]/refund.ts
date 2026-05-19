import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  locations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { adminRefund } from "@/lib/payments/admin-refund";

const refundSchema = z.object({
  amountCents: z.number().int().min(0),
  reason: z.string().optional(),
  alsoCancel: z.boolean().optional(),
});

/**
 * Admin-direct refund — issues a Stripe refund (full or partial) without
 * requiring a prior customer refund request. Pairs optionally with cancel
 * via `alsoCancel: true`; otherwise the registration stays in its current
 * status with paymentStatus moving to partial_refund / refunded.
 *
 * The Stripe call + DB updates + customer email are all in the shared
 * `adminRefund()` helper.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await context.request.json().catch(() => ({}));
    const validation = refundSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { amountCents, reason, alsoCancel } = validation.data;

    const [row] = await getDb()
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
      .where(
        and(
          eq(registrations.id, id),
          eq(locations.organizationId, orgContext.organizationId),
        ),
      );

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const childName = `${row.familyMember.firstName} ${row.familyMember.lastName}`;

    const result = await adminRefund({
      registration: row.registration,
      refundAmountCents: amountCents,
      reason,
      adminUserId: auth.user.id,
      organizationId: orgContext.organizationId,
      childName,
      programName: row.program.name,
      seasonName: row.season.name,
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error, details: result.details }),
        {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let registration = result.registration;

    if (alsoCancel && registration.status !== "cancelled" && registration.status !== "refunded") {
      const [cancelled] = await getDb()
        .update(registrations)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledReason: reason || null,
          cancelledBy: auth.user.id,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, id))
        .returning();
      registration = cancelled;
    }

    return new Response(
      JSON.stringify({
        success: true,
        registration,
        refund: {
          amountCents,
          stripeRefundId: result.stripeRefundId,
          isPartial: result.isPartial,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error processing admin direct refund:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

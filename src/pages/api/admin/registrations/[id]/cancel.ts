import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  locations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const cancelSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Admin-initiated cancel. Unlike the customer cancel endpoint
 * (POST /api/registrations/[id]/cancel), this does NOT apply the 7-day /
 * 50% / no-refund policy gates — admin is overriding. It also does NOT
 * auto-refund; refund is a separate explicit action so admins can cancel
 * without a refund (e.g. junk row) or refund without cancelling (price
 * adjustment).
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
    const validation = cancelSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { reason } = validation.data;

    const [row] = await getDb()
      .select({ registration: registrations })
      .from(registrations)
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

    if (
      row.registration.status === "cancelled" ||
      row.registration.status === "refunded"
    ) {
      return new Response(
        JSON.stringify({ error: "Registration is already cancelled" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const [updated] = await getDb()
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

    return new Response(JSON.stringify({ success: true, registration: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error cancelling registration (admin):", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

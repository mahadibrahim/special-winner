import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, seasons } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const editRegistrationSchema = z.object({
  registrationType: z.enum(["full", "deposit"]).optional(),
  notes: z.string().optional(),
});

// PATCH - Edit a registration
export const PATCH: APIRoute = async ({ params, request, locals }) => {
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
    const body = await request.json();
    const validation = editRegistrationSchema.safeParse(body);

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

    const data = validation.data;

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

    // Check if registration can be edited
    if (registration.status === "cancelled" || registration.status === "refunded") {
      return new Response(
        JSON.stringify({ error: "Cannot edit a cancelled registration" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    // Update notes if provided
    if (data.notes !== undefined) {
      updates.notes = data.notes;
    }

    // Handle registration type change (deposit to full)
    let additionalAmountDue = 0;
    if (data.registrationType && data.registrationType !== registration.registrationType) {
      // Can only upgrade from deposit to full
      if (registration.registrationType === "deposit" && data.registrationType === "full") {
        // Get season pricing
        const [season] = await getDb()
          .select()
          .from(seasons)
          .where(eq(seasons.id, registration.seasonId));

        if (season) {
          // Calculate new amount due (full price minus what's already paid)
          const fullPrice = season.priceCents;
          const alreadyPaid = registration.amountPaidCents;
          additionalAmountDue = fullPrice - alreadyPaid;

          updates.registrationType = "full";
          updates.amountDueCents = additionalAmountDue;
        }
      } else if (registration.registrationType === "full" && data.registrationType === "deposit") {
        return new Response(
          JSON.stringify({ error: "Cannot downgrade from full payment to deposit" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Update registration
    const [updated] = await getDb()
      .update(registrations)
      .set(updates)
      .where(eq(registrations.id, id))
      .returning();

    return new Response(
      JSON.stringify({
        registration: updated,
        additionalPaymentRequired: additionalAmountDue > 0,
        additionalAmountCents: additionalAmountDue,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error editing registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  registrations,
  payments,
  paymentPlans,
  scheduledPayments,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const updateFamilyMemberSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable().optional(),
  medicalNotes: z.string().nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(20).nullable().optional(),
});

// GET - Get single family member
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [member] = await getDb()
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, user.id)));

    if (!member) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ familyMember: member }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching family member:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// PUT - Update family member
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    const [existing] = await getDb()
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, user.id)));

    if (!existing) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const validation = updateFamilyMemberSchema.safeParse(body);

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
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.birthDate !== undefined) updateData.birthDate = data.birthDate;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.medicalNotes !== undefined) updateData.medicalNotes = data.medicalNotes;
    if (data.emergencyContactName !== undefined) updateData.emergencyContactName = data.emergencyContactName;
    if (data.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = data.emergencyContactPhone;

    const [updated] = await getDb()
      .update(familyMembers)
      .set(updateData)
      .where(eq(familyMembers.id, id))
      .returning();

    return new Response(JSON.stringify({ familyMember: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating family member:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// DELETE - Remove family member (COPPA: parent-initiated data deletion).
//
// Cascades through registrations + payment plans + scheduled payments. Blocks
// the delete if any payment is in a `succeeded` state — those need refund
// handling that we don't surface to parents directly. In that case the
// response advises the parent to contact us.
export const DELETE: APIRoute = async ({ params, locals }) => {
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
      return new Response(JSON.stringify({ error: "ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, user.id)));

    if (!existing) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Find this child's registrations.
    const childRegistrations = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(eq(registrations.familyMemberId, id));
    const registrationIds = childRegistrations.map((r) => r.id);

    if (registrationIds.length > 0) {
      // Block if any payment has actually settled — refund flow is staff-mediated.
      const [{ succeededCount }] = await db
        .select({ succeededCount: sql<number>`count(*)::int` })
        .from(payments)
        .where(
          and(
            inArray(payments.registrationId, registrationIds),
            eq(payments.status, "succeeded"),
          ),
        );

      if (succeededCount > 0) {
        return new Response(
          JSON.stringify({
            error:
              "This child has paid registrations on file. Please contact us at info@aspiresports.com to request a refund and full record deletion.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }

      // Cascade-delete: scheduled payments → payment plans → unpaid payments
      // → registrations → family member (which cascades to media tags,
      // assessments, family-member-parents, team rosters via FK).
      const planRows = await db
        .select({ id: paymentPlans.id })
        .from(paymentPlans)
        .where(inArray(paymentPlans.registrationId, registrationIds));
      const planIds = planRows.map((p) => p.id);

      if (planIds.length > 0) {
        await db
          .delete(scheduledPayments)
          .where(inArray(scheduledPayments.paymentPlanId, planIds));
        await db.delete(paymentPlans).where(inArray(paymentPlans.id, planIds));
      }

      await db
        .delete(payments)
        .where(inArray(payments.registrationId, registrationIds));
      await db
        .delete(registrations)
        .where(inArray(registrations.id, registrationIds));
    }

    await db.delete(familyMembers).where(eq(familyMembers.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting family member:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

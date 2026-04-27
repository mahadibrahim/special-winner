import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { eq, or, asc } from "drizzle-orm";
import { z } from "zod";
import { getPostHogServer } from "@/lib/posthog-server";

const createFamilyMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  medicalNotes: z.string().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  // COPPA: separate, affirmative parental consent for THIS child. Account-
  // level ToS does not satisfy verifiable parental consent.
  parentalConsent: z.boolean().refine((v) => v === true, {
    message:
      "Parental consent is required to add a child. Please confirm you are the parent or legal guardian.",
  }),
});

// GET - List family members for current user
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const rows = await db
      .select()
      .from(familyMembers)
      .where(
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        ),
      )
      .orderBy(asc(familyMembers.createdAt));

    const members = rows.map((r) => ({
      ...r,
      kind: r.selfUserId ? "self" : "dependent",
    }));

    return new Response(JSON.stringify({ familyMembers: members }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching family members:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create new family member
export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const body = await request.json();
    const validation = createFamilyMemberSchema.safeParse(body);

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

    const [newMember] = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId: user.id,
        firstName: data.firstName,
        lastName: data.lastName,
        birthDate: data.birthDate,
        gender: data.gender,
        medicalNotes: data.medicalNotes || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        parentalConsentGivenAt: new Date(),
        parentalConsentGivenBy: user.id,
        parentalConsentIp: clientAddress ?? null,
      })
      .returning();

    const posthog = getPostHogServer();
    posthog.capture({ distinctId: user.id, event: "family_member_added", properties: { family_member_id: newMember.id, has_gender: !!data.gender, has_medical_notes: !!data.medicalNotes, has_emergency_contact: !!data.emergencyContactName } });

    return new Response(JSON.stringify({ familyMember: newMember }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating family member:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

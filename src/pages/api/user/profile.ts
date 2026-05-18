import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20).optional().nullable(),
  // Optional: only set the first time the user completes their profile.
  // Required for adult-self registrations — the registration wizard
  // surfaces an inline "complete your profile" form when this is missing
  // so the customer doesn't get silently routed to the dependent-add flow.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
    .optional()
    .nullable(),
  gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional()
    .nullable(),
});

// GET - Get current user profile
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const [profile] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch profile" }), { status: 500 });
  }
};

// PUT - Update user profile
export const PUT: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await context.request.json();
    const result = profileSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      phone: result.data.phone,
      updatedAt: new Date(),
    };
    // Only set birthDate/gender when the caller actually included them —
    // a PUT that omits these should not blank existing values.
    if (result.data.birthDate !== undefined) {
      updates.birthDate = result.data.birthDate;
    }
    if (result.data.gender !== undefined) {
      updates.gender = result.data.gender;
    }

    const [updatedProfile] = await getDb()
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        birthDate: users.birthDate,
        gender: users.gender,
        avatarUrl: users.avatarUrl,
      });

    return new Response(JSON.stringify({ profile: updatedProfile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return new Response(JSON.stringify({ error: "Failed to update profile" }), { status: 500 });
  }
};

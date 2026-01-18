import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20).optional().nullable(),
});

// GET - Get current user profile
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const [profile] = await db
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

    const [updatedProfile] = await db
      .update(users)
      .set({
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        phone: result.data.phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
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

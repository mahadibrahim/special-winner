import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { hashPassword, createSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
});

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const { email, password, firstName, lastName, phone } = result.data;

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "An account with this email already exists" }),
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        emailVerified: false,
      })
      .returning();

    // Assign default "parent" role
    const parentRole = await db.query.roles.findFirst({
      where: eq(roles.name, "parent"),
    });

    if (parentRole) {
      await db.insert(userRoles).values({
        userId: newUser.id,
        roleId: parentRole.id,
        scopeType: "global",
      });
    }

    // Create session
    await createSession(newUser.id, context);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

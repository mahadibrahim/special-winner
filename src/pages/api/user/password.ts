import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// POST - Change password
export const POST: APIRoute = async (context) => {
  const { user, session } = await validateSession(context);
  if (!user || !session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await context.request.json();
    const result = passwordSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 }
      );
    }

    // Get current user's password hash
    const [userData] = await getDb()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userData?.passwordHash) {
      return new Response(
        JSON.stringify({ error: "Password not set. Please use password reset." }),
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await verifyPassword(result.data.currentPassword, userData.passwordHash);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Current password is incorrect" }),
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(result.data.newPassword);

    // Update password
    await getDb()
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Invalidate all other sessions (security measure)
    await getDb()
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, user.id),
          ne(sessions.id, session.id)
        )
      );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password updated successfully. Other sessions have been logged out.",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error changing password:", error);
    return new Response(JSON.stringify({ error: "Failed to change password" }), { status: 500 });
  }
};

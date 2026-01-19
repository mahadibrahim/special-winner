import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users, passwordResetTokens, sessions } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 }
      );
    }

    const { token, password } = result.data;

    // Find valid token
    const resetToken = await getDb()
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.id, token),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!resetToken.length) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset link. Please request a new one." }),
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update user password
    await getDb()
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken[0].userId));

    // Delete used token
    await getDb()
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, token));

    // Invalidate all existing sessions for this user (security measure)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.userId, resetToken[0].userId));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset successfully. Please sign in with your new password.",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users, emailVerificationTokens, sessions } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// Sessions created during the pre-verification window are shortened to
// 1 hour. After the user verifies their email, refresh all their
// sessions to the normal 30-day lifetime so they don't get logged out
// minutes after confirming.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const result = verifyEmailSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 }
      );
    }

    const { token } = result.data;

    // Find valid token
    const verificationToken = await getDb()
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.id, token),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!verificationToken.length) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification link. Please request a new one." }),
        { status: 400 }
      );
    }

    const userId = verificationToken[0].userId;

    // Update user email verified status
    await getDb()
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Delete used token and any other tokens for this user
    await getDb()
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));

    // Refresh all active sessions to the normal 30-day window — these
    // sessions were capped at 1 hour during the pre-verification phase.
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + THIRTY_DAYS_MS) })
      .where(eq(sessions.userId, userId));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email verified successfully",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Verify email error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

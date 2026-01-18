import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

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
    const verificationToken = await db
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

    // Update user email verified status
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, verificationToken[0].userId));

    // Delete used token and any other tokens for this user
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, verificationToken[0].userId));

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

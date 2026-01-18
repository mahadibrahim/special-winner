import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { render } from "@react-email/components";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { PasswordResetEmail } from "@/lib/email/templates/password-reset";
import crypto from "crypto";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 }
      );
    }

    const { email } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account exists with this email, you will receive a password reset link.",
        }),
        { status: 200 }
      );
    }

    // Delete any existing reset tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user[0].id));

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token
    await db.insert(passwordResetTokens).values({
      id: token,
      userId: user[0].id,
      expiresAt,
    });

    // Send email
    if (isEmailConfigured()) {
      const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";
      const resetUrl = `${appUrl}/reset-password/${token}`;

      const html = await render(
        PasswordResetEmail({
          name: user[0].firstName || "",
          resetUrl,
          expiresIn: "1 hour",
        })
      );

      await sendEmail({
        to: normalizedEmail,
        subject: "Reset Your Password - Aspire Sports",
        html,
      });
    } else {
      console.warn("Email not configured, password reset email not sent");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link.",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { render } from "@react-email/components";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { EmailVerificationEmail } from "@/lib/email/templates/email-verification";
import { validateSession } from "@/lib/auth/session";
import crypto from "crypto";

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const { user } = await validateSession(context);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    // Check if already verified
    const userData = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userData.length) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404 }
      );
    }

    if (userData[0].emailVerified) {
      return new Response(
        JSON.stringify({ error: "Email already verified" }),
        { status: 400 }
      );
    }

    // Delete any existing verification tokens for this user
    await getDb()
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token
    await getDb().insert(emailVerificationTokens).values({
      id: token,
      userId: user.id,
      email: userData[0].email,
      expiresAt,
    });

    // Send email
    if (isEmailConfigured()) {
      const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";
      const verifyUrl = `${appUrl}/verify-email/${token}`;

      const html = await render(
        EmailVerificationEmail({
          name: userData[0].firstName || "",
          verifyUrl,
          expiresIn: "24 hours",
        })
      );

      await sendEmail({
        to: userData[0].email,
        subject: "Verify Your Email - Aspire Sports",
        html,
      });
    } else {
      console.warn("Email not configured, verification email not sent");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Verification email sent",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Send verification error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

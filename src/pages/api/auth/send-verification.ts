import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isEmailConfigured } from "@/lib/email";
import { sendEmailVerificationEmail } from "@/lib/email/send";
import { validateSession } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/token-hash";
import { brandFromHost, originForBrand } from "@/lib/organization/soccerone-routing";
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

    // Generate secure token. Only the SHA-256 digest is stored — the
    // plaintext goes into the email link and is hashed again on
    // consumption (see /api/auth/verify-email).
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token digest
    await getDb().insert(emailVerificationTokens).values({
      id: hashToken(token),
      userId: user.id,
      email: userData[0].email,
      expiresAt,
    });

    // Send email
    if (isEmailConfigured()) {
      const brand = brandFromHost(context.request.headers.get("host") ?? "");
      const appUrl =
        originForBrand(brand) ??
        import.meta.env.PUBLIC_APP_URL ??
        "http://localhost:4321";
      const verifyUrl = `${appUrl}/verify-email/${token}`;

      await sendEmailVerificationEmail({
        userId: user.id,
        recipientEmail: userData[0].email,
        name: userData[0].firstName || "",
        verifyUrl,
        expiresIn: "24 hours",
        brand,
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

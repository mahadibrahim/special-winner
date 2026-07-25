import type { APIRoute } from "astro";
import { z } from "zod";
import { consumeEmailVerificationToken } from "@/lib/auth/email-verification";

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

    // Shared consumer: hashes the presented token (storage holds the digest),
    // marks the account verified, and refreshes sessions from the 1h
    // pre-verification cap back to 30 days. Kept in one place so this endpoint
    // and verify-email/[token].astro cannot drift apart again.
    const { ok } = await consumeEmailVerificationToken(result.data.token);

    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification link. Please request a new one." }),
        { status: 400 }
      );
    }

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

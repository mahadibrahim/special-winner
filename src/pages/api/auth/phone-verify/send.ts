import type { APIRoute } from "astro";
import { z } from "zod";
import { createPhoneVerification } from "@/lib/auth/phone-otp";

/**
 * POST /api/auth/phone-verify/send
 *
 * Creates a phone verification and sends the 6-digit OTP code via SMS.
 * Returns an opaque verificationId that the client must include when
 * checking the code via POST /api/auth/phone-verify/check.
 */

const sendSchema = z.object({
  phone: z.string().min(7).max(20),
  organizationId: z.string().uuid(),
  purpose: z.enum(["registration", "phone_change", "recovery"]),
  purposeContext: z.record(z.string(), z.any()).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const result = sendSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 },
      );
    }

    const create = await createPhoneVerification(result.data);

    if (!create.ok) {
      const message =
        create.reason === "invalid_phone"
          ? "Please enter a valid phone number"
          : "Could not send verification code. Please try again.";
      return new Response(
        JSON.stringify({ error: message, reason: create.reason }),
        { status: create.reason === "invalid_phone" ? 400 : 502 },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        verificationId: create.verificationId,
        expiresAt: create.expiresAt.toISOString(),
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Phone verify send error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 },
    );
  }
};

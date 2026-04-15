import type { APIRoute } from "astro";
import { z } from "zod";
import { verifyPhoneCode } from "@/lib/auth/phone-otp";

/**
 * POST /api/auth/phone-verify/check
 *
 * Validates a 6-digit OTP code against a verification record. On success,
 * returns a success flag and the verified phone number. The caller is
 * responsible for attaching the verified phone to whatever flow they're in
 * (e.g., completing the registration wizard).
 */

const checkSchema = z.object({
  verificationId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const result = checkSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 },
      );
    }

    const verify = await verifyPhoneCode(
      result.data.verificationId,
      result.data.code,
    );

    if (!verify.ok) {
      const statusMap: Record<typeof verify.reason, number> = {
        not_found: 404,
        expired: 410,
        already_consumed: 410,
        too_many_attempts: 429,
        wrong_code: 401,
      };
      const messageMap: Record<typeof verify.reason, string> = {
        not_found: "Verification not found",
        expired: "This code has expired. Request a new one.",
        already_consumed: "This code has already been used.",
        too_many_attempts: "Too many failed attempts. Request a new code.",
        wrong_code: "Incorrect code. Please try again.",
      };

      return new Response(
        JSON.stringify({
          error: messageMap[verify.reason],
          reason: verify.reason,
          attemptsRemaining: verify.attemptsRemaining,
        }),
        { status: statusMap[verify.reason] },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        phone: verify.phone,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Phone verify check error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 },
    );
  }
};

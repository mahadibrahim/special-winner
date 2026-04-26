import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneVerifications } from "@/lib/db/schema/phone-verifications";
import { verifyPhoneCode } from "@/lib/auth/phone-otp";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

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

    // Rate-limit OTP guesses per verification's phone number. The OTP itself
    // is 6 digits / 5 attempts / 10-min window, so brute force isn't really
    // feasible on a single record, but a determined attacker could request
    // many records and try a few codes on each. Capping by phone closes
    // that loop. Look up the phone before calling verify so the limit
    // applies even on wrong codes.
    const phoneRow = await getDb()
      .select({ phone: phoneVerifications.phone })
      .from(phoneVerifications)
      .where(eq(phoneVerifications.id, result.data.verificationId))
      .limit(1);

    if (phoneRow.length > 0) {
      const phoneLimit = rateLimit(
        `phone-otp-check:${phoneRow[0].phone}`,
        5,
        60_000,
      );
      if (!phoneLimit.allowed) {
        return rateLimitedResponse(phoneLimit.retryAfter ?? 60);
      }
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

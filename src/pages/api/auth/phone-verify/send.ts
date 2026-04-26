import type { APIRoute } from "astro";
import { z } from "zod";
import { createPhoneVerification } from "@/lib/auth/phone-otp";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { normalizeUsPhone } from "@/lib/sms/send";

/**
 * POST /api/auth/phone-verify/send
 *
 * Creates a phone verification and sends the 6-digit OTP code via SMS.
 * Returns an opaque verificationId that the client must include when
 * checking the code via POST /api/auth/phone-verify/check.
 *
 * Security:
 *  - The body's `organizationId` MUST equal `locals.organization?.id`. We
 *    don't trust the body field alone — that would let an attacker
 *    target any org's SMS-enabled flow from any host.
 *  - The endpoint is rate-limited per phone (1/min) and per IP (5/hour) to
 *    cap SMS toll fraud on a successful injection.
 */

const sendSchema = z.object({
  phone: z.string().min(7).max(20),
  organizationId: z.string().uuid(),
  purpose: z.enum(["registration", "phone_change", "recovery"]),
  purposeContext: z.record(z.string(), z.any()).optional(),
});

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  try {
    const ip = clientAddress || "unknown";

    // Org context must come from the resolved subdomain/custom-domain. If
    // we don't have one, refuse — anonymous unattributed SMS is exactly
    // the toll-fraud surface we're closing.
    const orgFromContext = locals.organization?.id;
    if (!orgFromContext) {
      return new Response(
        JSON.stringify({ error: "Organization context required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const result = sendSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 },
      );
    }

    // Tenant binding: refuse if the body claims a different org than the
    // host the request came in on. Don't trust the body field standalone.
    if (result.data.organizationId !== orgFromContext) {
      return new Response(
        JSON.stringify({ error: "Organization mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Rate-limit by normalized phone (so the same E.164 number coming from
    // different IPs still hits one bucket) and by IP (so a single host can't
    // spray many phones).
    const normalized = normalizeUsPhone(result.data.phone) ?? result.data.phone;

    const phoneLimit = rateLimit(
      `phone-otp:phone:${normalized}`,
      1,
      60_000,
    );
    if (!phoneLimit.allowed) {
      return rateLimitedResponse(phoneLimit.retryAfter ?? 60);
    }

    const ipLimit = rateLimit(
      `phone-otp:ip:${ip}`,
      5,
      60 * 60 * 1000,
    );
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfter ?? 3600);
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

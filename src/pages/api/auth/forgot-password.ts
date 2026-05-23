import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { isEmailConfigured } from "@/lib/email";
import { sendSignInLinkEmail } from "@/lib/email/send";

/**
 * Forgot-password / magic-link login handler.
 *
 * This endpoint used to create bespoke one-time reset tokens. Phase 1
 * generalizes all out-of-band auth into the magic-link module, so this
 * route now creates a magic link with purpose `password_reset_login`
 * and emails the redemption URL.
 *
 * When the parent taps the link, they land directly in an authenticated
 * session — they don't have to enter a new password unless they want to.
 * Staff users (admins, coaches) still have password auth as a primary
 * method; the magic link is an alternative path for them too.
 */

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Cloudflare Turnstile token from the client widget. Optional in the
  // schema so the route validates it explicitly with a friendly error.
  turnstileToken: z.string().optional(),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const ip = clientAddress || "unknown";

    // Per-IP burst limit. Stops a single attacker from flooding the
    // magic-link issuer (which sends real emails).
    const ipLimit = rateLimit(`forgot-password:ip:${ip}`, 3, 60_000);
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfter ?? 60);
    }

    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.issues[0].message }),
        { status: 400 },
      );
    }

    const { email, turnstileToken } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    // CAPTCHA check. verifyTurnstile fails closed in prod when the secret
    // is unset (so a misconfigured env var blocks requests instead of
    // letting bots through) and fails open in dev/preview.
    const turnstileOk = await verifyTurnstile(turnstileToken ?? "", {
      secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
      isProd: Boolean(import.meta.env.PROD),
    });
    if (!turnstileOk) {
      return new Response(
        JSON.stringify({
          error: "Please complete the CAPTCHA challenge before continuing.",
        }),
        { status: 400 },
      );
    }

    // Per-email hourly cap. Caps the volume of magic-link emails any single
    // address can generate even from rotating IPs (mailbox-bombing defense).
    const emailLimit = rateLimit(
      `forgot-password:email:${normalizedEmail}`,
      5,
      60 * 60 * 1000,
    );
    if (!emailLimit.allowed) {
      return rateLimitedResponse(emailLimit.retryAfter ?? 3600);
    }

    // Find user by email
    const user = await getDb()
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "If an account exists with this email, you will receive a sign-in link.",
        }),
        { status: 200 },
      );
    }

    const targetUser = user[0];

    // Create a magic-link-based login token
    const { token } = await createMagicLink({
      userId: targetUser.id,
      purpose: "password_reset_login",
      deliveredChannel: "email",
      deliveredTo: normalizedEmail,
    });

    // Send email with the redemption URL
    if (isEmailConfigured()) {
      const signInUrl = buildMagicLinkUrl(token);
      await sendSignInLinkEmail({
        userId: targetUser.id,
        recipientEmail: normalizedEmail,
        name: targetUser.firstName || "",
        signInUrl,
        expiresIn: "15 minutes",
      });
    } else {
      console.warn("Email not configured, sign-in link not sent");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "If an account exists with this email, you will receive a sign-in link.",
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 },
    );
  }
};

import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { isSafeRelativePath } from "@/lib/auth/magic-link-destination";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { eq } from "drizzle-orm";
import { getPostHogServer } from "@/lib/posthog-server";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { isEmailConfigured } from "@/lib/email";
import { sendSignInLinkEmail } from "@/lib/email/send";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Password is OPTIONAL and accepted only for back-compat with E2E tests
  // and the password-based admin auth path. New signups via the UI are
  // passwordless — the form doesn't collect one. When present it must
  // still be 8+ chars so a weak password isn't silently stored.
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  // Cloudflare Turnstile token from the client widget. Optional in the
  // schema so the route can validate it explicitly (and return a friendly
  // error) rather than failing on the zod boundary.
  turnstileToken: z.string().optional(),
  // Post-redemption return path, carried through the sign-up roundtrip so a
  // customer who creates an account mid-registration lands back on
  // /register/<season>. Validated as a safe relative path before use.
  redirectTo: z.string().optional(),
});

export const POST: APIRoute = async (context) => {
  try {
    const ip = context.clientAddress || "unknown";

    // 3 signups/min per IP. Stops scripted account-creation floods that would
    // otherwise create users + send transactional emails on every request.
    const ipLimit = rateLimit(`signup:ip:${ip}`, 3, 60_000);
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfter ?? 60);
    }

    const body = await context.request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const { email, password, firstName, lastName, phone, turnstileToken, redirectTo } = result.data;
    const emailLower = email.toLowerCase();
    const emailCanonical = normalizeForUniqueness(email);

    // CAPTCHA check. verifyTurnstile fails closed in prod when the secret
    // is unset (so a misconfigured env var blocks signups instead of
    // letting bots through) and fails open in dev/preview so local
    // iteration isn't gated on a Cloudflare account.
    const turnstileOk = await verifyTurnstile(turnstileToken ?? "", {
      secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
      isProd: Boolean(import.meta.env.PROD),
    });
    if (!turnstileOk) {
      return new Response(
        JSON.stringify({
          error: "Please complete the CAPTCHA challenge before signing up.",
        }),
        { status: 400 },
      );
    }

    // Check if user already exists — uniqueness is on the CANONICAL form
    // (Gmail dot-trick normalization), so `a.g.i.v.o.b@gmail.com` and
    // `agivob@gmail.com` collide as expected.
    const existingUser = await getDb().query.users.findFirst({
      where: eq(users.emailCanonical, emailCanonical),
    });

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "An account with this email already exists" }),
        { status: 409 }
      );
    }

    // Hash password only if one was provided (back-compat path for E2E +
    // legacy script callers). Magic-link UI signups send no password and
    // the column stays NULL — the user authenticates via the link.
    const passwordHash = password ? await hashPassword(password) : null;

    // Create user
    const [newUser] = await getDb()
      .insert(users)
      .values({
        email: emailLower,
        emailCanonical,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        emailVerified: false,
      })
      .returning();

    // Assign default "parent" role
    const parentRole = await getDb().query.roles.findFirst({
      where: eq(roles.name, "parent"),
    });

    if (parentRole) {
      await getDb().insert(userRoles).values({
        userId: newUser.id,
        roleId: parentRole.id,
        scopeType: "global",
      });
    }

    // Magic-link path: don't create a session here. Email a one-tap
    // sign-in link instead — clicking it is what creates the session
    // (the magic-link consumption endpoint marks email verified at the
    // same time). For back-compat callers that DO send a password (E2E,
    // some admin tooling), we still skip the session here and let them
    // sign in via /api/auth/signin themselves.
    if (isEmailConfigured()) {
      const { token } = await createMagicLink({
        userId: newUser.id,
        purpose: "password_reset_login",
        deliveredChannel: "email",
        deliveredTo: emailLower,
        purposeContext: isSafeRelativePath(redirectTo) ? { redirectTo } : undefined,
      });
      // Origin-aware: the link must redeem on the domain the user signed up
      // from (session cookies are per-domain across the two brand hosts).
      const signinUrl = buildMagicLinkUrl(token, { origin: context.url.origin });
      await sendSignInLinkEmail({
        userId: newUser.id,
        recipientEmail: emailLower,
        name: newUser.firstName || "",
        signInUrl: signinUrl,
        expiresIn: "15 minutes",
      });
    } else {
      console.warn("Email not configured, sign-in link not sent");
    }

    const posthog = getPostHogServer();
    const phSessionId = context.request.headers.get("X-PostHog-Session-Id") || undefined;
    posthog.identify({ distinctId: newUser.id, properties: { email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName } });
    posthog.capture({
      distinctId: newUser.id,
      event: "user_signed_up",
      properties: {
        $session_id: phSessionId,
        has_phone: !!phone,
        passwordless: !password,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        // The caller doesn't get a session — they have to tap the magic
        // link in the email we just sent. UI surfaces a "check your inbox"
        // confirmation state instead of redirecting to /dashboard.
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
        roles: parentRole ? ["parent"] : [],
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

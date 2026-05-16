import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users, userRoles, roles, sessions } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";
import { lucia } from "@/lib/auth/lucia";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { eq } from "drizzle-orm";
import { getPostHogServer } from "@/lib/posthog-server";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

// Short pre-verification session: a freshly-signed-up account holds a
// 1-hour session until they verify their email. On verification we
// re-issue a normal 30-day session. Prevents bots from sitting on a
// 30-day session with an unverified email.
const ONE_HOUR_MS = 60 * 60 * 1000;

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
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

    const { email, password, firstName, lastName, phone } = result.data;
    const emailLower = email.toLowerCase();
    const emailCanonical = normalizeForUniqueness(email);

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

    // Hash password
    const passwordHash = await hashPassword(password);

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

    // Create session, then shorten its expiry to 1 hour since the new
    // user hasn't verified their email yet. The cookie attributes Lucia
    // sets remain at the default 30-day lifetime — that's fine; the
    // server-side validation rejects after 1 hour and the user re-signs-in
    // or completes verification first.
    const newSession = await lucia.createSession(newUser.id, {});
    const sessionCookie = lucia.createSessionCookie(newSession.id);
    context.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes,
    );
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + ONE_HOUR_MS) })
      .where(eq(sessions.id, newSession.id));

    const posthog = getPostHogServer();
    const phSessionId = context.request.headers.get("X-PostHog-Session-Id") || undefined;
    posthog.identify({ distinctId: newUser.id, properties: { email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName } });
    posthog.capture({ distinctId: newUser.id, event: "user_signed_up", properties: { $session_id: phSessionId, has_phone: !!phone } });

    return new Response(
      JSON.stringify({
        success: true,
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

import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";
import { lucia } from "@/lib/auth/lucia";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { eq } from "drizzle-orm";
import { getPostHogServer } from "@/lib/posthog-server";

const signinSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const POST: APIRoute = async (context) => {
  try {
    const ip = context.clientAddress || "unknown";

    // Per-IP rate limit first (cheap, applies even before parsing body).
    const ipLimit = rateLimit(`signin:ip:${ip}`, 5, 60_000);
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfter ?? 60);
    }

    const body = await context.request.json();
    const result = signinSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const { email, password } = result.data;
    const normalizedEmail = email.toLowerCase();

    // Per-email rate limit (slows down credential-stuffing against one
    // account from rotating IPs).
    const emailLimit = rateLimit(`signin:email:${normalizedEmail}`, 10, 60_000);
    if (!emailLimit.allowed) {
      return rateLimitedResponse(emailLimit.retryAfter ?? 60);
    }

    // Find user
    const user = await getDb().query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user || !user.passwordHash) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401 }
      );
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401 }
      );
    }

    // Session fixation defense: if the request arrived with an existing
    // session cookie (e.g., a pre-attached anon session), invalidate it
    // before issuing a new authenticated one. Otherwise an attacker who
    // pre-set a session cookie on a victim's browser could ride along on
    // the privilege escalation.
    const existingSessionId =
      context.cookies.get(lucia.sessionCookieName)?.value ?? null;
    if (existingSessionId) {
      try {
        await lucia.invalidateSession(existingSessionId);
      } catch (err) {
        // Don't block signin if invalidation fails — log and continue.
        console.error("Pre-signin session invalidation failed:", err);
      }
    }

    // Create session
    await createSession(user.id, context);

    // Fetch user roles
    const userRolesList = await getDb()
      .select({
        roleName: roles.name,
        scopeType: userRoles.scopeType,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    const roleNames = userRolesList.map((r) => r.roleName);

    const posthog = getPostHogServer();
    const phSessionId = context.request.headers.get("X-PostHog-Session-Id") || undefined;
    posthog.identify({ distinctId: user.id, properties: { email: user.email, firstName: user.firstName, lastName: user.lastName } });
    posthog.capture({ distinctId: user.id, event: "user_signed_in", properties: { $session_id: phSessionId, roles: roleNames } });

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified,
        },
        roles: roleNames,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Signin error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};

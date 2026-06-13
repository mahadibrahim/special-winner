import type { APIRoute } from "astro";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { lucia } from "@/lib/auth/lucia";
import { getUserRoles } from "@/lib/auth/roles";
import { destinationFor } from "@/lib/auth/magic-link-destination";
import { getPostHogServer } from "@/lib/posthog-server";

/**
 * Magic-link redemption endpoint.
 *
 * GET /m/:token — consumes the token atomically, creates a Lucia session
 * for the bound user, and redirects the browser to the purpose-specific
 * task page.
 *
 * This route is intentionally a plain APIRoute (not an .astro page) so the
 * redirect can happen before any HTML renders — the parent should land
 * directly on their destination, not see a flash of a landing page.
 */

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, redirect, url }) => {
  const token = params.token;

  if (!token || typeof token !== "string") {
    return redirect(expiredUrl(url.origin, "malformed"));
  }

  const result = await consumeMagicLink(token);

  if (!result.ok) {
    return redirect(expiredUrl(url.origin, result.reason));
  }

  // Create a Lucia session for the bound user
  const session = await lucia.createSession(result.userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  // Magic-link redemption is the primary login path (customer-facing
  // /signin and /signup are magic-link only), so this is where most real
  // logins are recorded. Mirrors the user_signed_in capture in
  // /api/auth/signin. Fire-and-forget + fail-soft — a telemetry hiccup must
  // never block the login redirect.
  try {
    getPostHogServer().capture({
      distinctId: result.userId,
      event: "user_signed_in",
      properties: { method: "magic_link", purpose: result.purpose },
    });
  } catch (err) {
    console.error("[m/token] sign-in telemetry failed", err);
  }

  // For plain-login purposes, send admin roles to /admin instead of /dashboard.
  const userRoles = await getUserRoles(result.userId);
  const isAdminRole = userRoles.some(
    (r) => r.name === "super_admin" || r.name === "location_admin",
  );

  const destination = destinationFor(
    result.purpose,
    result.purposeContext,
    url.origin,
    { isAdminRole },
  );
  return redirect(destination);
};

function expiredUrl(_origin: string, reason: string): string {
  const params = new URLSearchParams({ reason });
  return `/auth/link-expired?${params.toString()}`;
}

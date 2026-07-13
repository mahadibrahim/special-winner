import type { APIRoute } from "astro";

/**
 * GET /api/auth/me
 * Returns the currently authenticated user. Mirrors /api/auth/session.
 *
 * Reads `context.locals.user`/`.session` instead of calling
 * validateSession() itself. Middleware (src/middleware.ts) already runs
 * lucia.validateSession() on every request — including /api/** routes,
 * since the auth block runs before the `pathname.startsWith("/api/")`
 * early-out that only skips *redirect* logic — and populates locals with
 * the identical { user, session } shape. Re-validating here duplicated
 * that DB round trip on every call to the single highest-traffic
 * endpoint on the site (fired from Navigation on every non-SSR page
 * view). See .superpowers/sdd/perf-sweep-customer.md item 2.
 */
export const GET: APIRoute = async (context) => {
  const { user, session } = context.locals;

  if (!user || !session) {
    return new Response(
      JSON.stringify({ user: null, authenticated: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
      },
      authenticated: true,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

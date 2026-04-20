import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the currently authenticated user. Mirrors /api/auth/session.
 */
export const GET: APIRoute = async (context) => {
  const { user, session } = await validateSession(context);

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

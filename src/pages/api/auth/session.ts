import type { APIRoute } from "astro";

export const GET: APIRoute = async (context) => {
  // For preview mode without database, return unauthenticated
  // In production, this would validate the session
  try {
    const { validateSession } = await import("@/lib/auth");
    const { user, session } = await validateSession(context);

    if (!user || !session) {
      return new Response(
        JSON.stringify({ user: null, authenticated: false }),
        { status: 200 }
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
      { status: 200 }
    );
  } catch (error) {
    // Database not connected - return unauthenticated
    return new Response(
      JSON.stringify({ user: null, authenticated: false }),
      { status: 200 }
    );
  }
};

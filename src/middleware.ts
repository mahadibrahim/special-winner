import { defineMiddleware } from "astro:middleware";
import { resolveOrganizationFromHost } from "./lib/organization/domain-resolver";

// Routes that require authentication
const protectedRoutes = ["/dashboard", "/coach", "/admin"];

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ["/signin", "/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Default to no user/session/organization
  context.locals.user = null;
  context.locals.session = null;
  context.locals.organization = null;
  context.locals.currentLocation = null;

  // Resolve organization from domain
  try {
    const host = context.request.headers.get("host") || "localhost";
    const resolved = await resolveOrganizationFromHost(host);

    if (resolved) {
      context.locals.organization = resolved.organization;
      context.locals.currentLocation = resolved.location;
    }
  } catch (error) {
    console.log("Middleware: Error resolving organization from host");
  }

  try {
    // Try to import and use lucia - will fail if no database
    const { lucia } = await import("./lib/auth/lucia");
    const sessionId = context.cookies.get(lucia.sessionCookieName)?.value ?? null;

    if (sessionId) {
      const { session, user } = await lucia.validateSession(sessionId);

      if (session && session.fresh) {
        const sessionCookie = lucia.createSessionCookie(session.id);
        context.cookies.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes
        );
      }

      if (!session) {
        const sessionCookie = lucia.createBlankSessionCookie();
        context.cookies.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes
        );
      }

      context.locals.user = user;
      context.locals.session = session;
    }
  } catch (error) {
    // Database not available - continue without auth
    // This allows preview mode to work
    console.log("Auth middleware: Database not available, skipping auth");
  }

  const pathname = context.url.pathname;

  // Check if route requires authentication
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtectedRoute && !context.locals.user) {
    // Redirect to signin with return URL
    const returnUrl = encodeURIComponent(pathname);
    return context.redirect(`/signin?returnUrl=${returnUrl}`);
  }

  // Redirect authenticated users away from auth routes
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  if (isAuthRoute && context.locals.user) {
    return context.redirect("/dashboard");
  }

  return next();
});

import { defineMiddleware } from "astro:middleware";
import { resolveOrganizationFromHost } from "./lib/organization/domain-resolver";
import { lucia } from "./lib/auth/lucia";
import { getUserRoles, getCoachTeamIds } from "./lib/auth/roles";

// Routes that require authentication
const protectedRoutes = ["/dashboard", "/coach", "/admin"];

// Routes that require admin role
const adminRoutes = ["/admin"];

// Routes that require coach role
const coachRoutes = ["/coach"];

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ["/signin", "/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Default to no user/session/organization
  context.locals.user = null;
  context.locals.session = null;
  context.locals.organization = null;
  context.locals.currentLocation = null;
  context.locals.userRoles = [];
  context.locals.isAdmin = false;
  context.locals.isCoach = false;

  // Resolve organization from domain (non-blocking — if it fails, we just
  // proceed without organization context and the page handles it).
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

      // Fetch user roles + coach teams in parallel if authenticated.
      // These are independent queries — serializing them wasted a
      // round-trip of latency on every authenticated page view.
      if (user) {
        try {
          const [roles, coachTeamIds] = await Promise.all([
            getUserRoles(user.id),
            getCoachTeamIds(user.id),
          ]);
          context.locals.userRoles = roles;
          context.locals.isAdmin = roles.some(
            (role) => role.name === "super_admin" || role.name === "location_admin"
          );
          context.locals.isCoach = coachTeamIds.length > 0;
        } catch (error) {
          console.log("Middleware: Error fetching user roles");
        }
      }
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

  // Check admin role for admin routes
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));
  if (isAdminRoute && context.locals.user && !context.locals.isAdmin) {
    // User is authenticated but not an admin - redirect to dashboard with error
    return context.redirect("/dashboard?error=unauthorized");
  }

  // Check coach role for coach routes
  const isCoachRoute = coachRoutes.some((route) => pathname.startsWith(route));
  if (isCoachRoute && context.locals.user && !context.locals.isCoach && !context.locals.isAdmin) {
    // User is authenticated but not a coach or admin - redirect to dashboard
    return context.redirect("/dashboard?error=unauthorized");
  }

  // Redirect authenticated users away from auth routes
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  if (isAuthRoute && context.locals.user) {
    return context.redirect("/dashboard");
  }

  return next();
});

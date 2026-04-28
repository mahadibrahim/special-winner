import { defineMiddleware } from "astro:middleware";
import { resolveOrganizationFromHost } from "./lib/organization/domain-resolver";
import { lucia } from "./lib/auth/lucia";
import { getUserRoles, getCoachTeamIds } from "./lib/auth/roles";
import { ensureEnvValidated } from "./lib/env";

// Env validation runs on the first request, not at module load. Validating
// at module load would also fire during `astro build` prerender and break
// builds run without the full prod env set (CI builds without Stripe keys,
// for example).

// ---------------------------------------------------------------------------
// Route-rule based auth enforcement
//
// First matching rule wins. API routes (/api/**) are excluded from all rules
// — they return 401 JSON and manage their own auth.
//
// kind: "authed"  — must be signed in; unauthenticated → /signin?redirect=…
// kind: "role"    — must be signed in AND have one of the listed roles;
//                   no user → /signin?redirect=…
//                   wrong role → /dashboard?error=unauthorized
// ---------------------------------------------------------------------------

type RouteRule =
  | { kind: "authed"; pattern: RegExp }
  | {
      kind: "role";
      pattern: RegExp;
      roles: Array<
        | "admin"
        | "super_admin"
        | "location_admin"
        | "coach"
        | "parent"
        | "media_staff"
        | "media_editor"
      >;
    };

const ROUTE_RULES: RouteRule[] = [
  // Admin dashboard — requires admin or super_admin role.
  // location_admin maps to "admin" semantics; both are covered by isAdmin flag.
  { kind: "role", pattern: /^\/admin(\/|$)/, roles: ["admin", "super_admin", "location_admin"] },
  // Coach portal — coaches AND admins may access.
  { kind: "role", pattern: /^\/coach(\/|$)/, roles: ["coach", "admin", "super_admin", "location_admin"] },
  // Authenticated-only areas.
  { kind: "authed", pattern: /^\/dashboard(\/|$)/ },
  { kind: "authed", pattern: /^\/account(\/|$)/ },
  { kind: "authed", pattern: /^\/messages(\/|$)/ },
  { kind: "authed", pattern: /^\/media(\/|$)/ },
];

// Authenticated users visiting these paths are bounced to /dashboard.
const REDIRECT_IF_AUTHED: RegExp[] = [
  /^\/signin(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/forgot-password(\/|$)/,
];

export const onRequest = defineMiddleware(async (context, next) => {
  // Validate env on first request; cached afterwards. In PROD this throws
  // (and fails the request) if required env vars are missing. In DEV it
  // warns to console.
  ensureEnvValidated();

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
  const user = context.locals.user;

  // API routes manage their own auth — skip all redirect logic.
  if (!pathname.startsWith("/api/")) {
    // Build the redirect param from the full path + query string so that
    // after sign-in the user lands back on the exact page they wanted.
    const redirectParam = encodeURIComponent(
      context.url.pathname + context.url.search
    );

    // Evaluate route rules (first match wins).
    for (const rule of ROUTE_RULES) {
      if (!rule.pattern.test(pathname)) continue;

      if (rule.kind === "authed") {
        if (!user) {
          return context.redirect(`/signin?redirect=${redirectParam}`);
        }
        // User is present — fall through to next().
        break;
      }

      if (rule.kind === "role") {
        if (!user) {
          return context.redirect(`/signin?redirect=${redirectParam}`);
        }
        // Check whether the user holds any of the required roles.
        // "admin" in the rule list means location_admin OR super_admin
        // (both of which set isAdmin=true). "coach" means isCoach=true.
        const userRoleNames = context.locals.userRoles.map((r) => r.name);
        const hasRequiredRole = rule.roles.some((required) => {
          if (required === "admin") return context.locals.isAdmin;
          if (required === "coach") return context.locals.isCoach;
          return userRoleNames.includes(required as never);
        });
        if (!hasRequiredRole) {
          return context.redirect("/dashboard?error=unauthorized");
        }
        // Role satisfied — fall through to next().
        break;
      }
    }

    // Bounce already-authenticated users away from sign-in / sign-up pages.
    if (user && REDIRECT_IF_AUTHED.some((rx) => rx.test(pathname))) {
      return context.redirect("/dashboard");
    }
  }

  return next();
});

import { defineMiddleware } from "astro:middleware";
import { resolveOrganizationFromHost } from "./lib/organization/domain-resolver";
import { resolveBrandProfile } from "./lib/branding/resolver";
import { lucia } from "./lib/auth/lucia";
import { getUserRoles, getCoachTeamIds } from "./lib/auth/roles";
import {
  ACTIVE_VENUE_COOKIE,
  validateActiveVenue,
} from "./lib/admin/active-venue";
import { ensureEnvValidated } from "./lib/env";
import {
  isSoccerOneHost,
  rewriteSoccerOnePath,
  getAspireToSoccerOneRedirect,
  brandFromHost,
} from "./lib/organization/soccerone-routing";

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
  { kind: "authed", pattern: /^\/portal(\/|$)/ },
  { kind: "authed", pattern: /^\/account(\/|$)/ },
  { kind: "authed", pattern: /^\/messages(\/|$)/ },
  { kind: "authed", pattern: /^\/media(\/|$)/ },
];

// Authenticated users visiting these paths are bounced to /dashboard.
const REDIRECT_IF_AUTHED: RegExp[] = [
  /^\/signin(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/email-link-signin(\/|$)/,
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
  context.locals.brand = null;
  context.locals.activeLocationId = null;
  // Host-derived brand id — pure, no DB. Distinct from `locals.brand`
  // (the brand_profiles content row): brandId always resolves, and is
  // the key for the typed theme in src/lib/branding/themes.ts.
  context.locals.brandId = brandFromHost(
    context.request.headers.get("host") ?? "",
  );

  // Resolve organization and brand profile from the host in parallel —
  // they're independent lookups (a host may belong to an org and also have
  // its own brand row, e.g. dropin marketing sites pointing at shared
  // inventory), and both are TTL-cached so this usually costs no queries.
  // Each failure is swallowed independently: the page proceeds without
  // that piece of context.
  {
    const host = context.request.headers.get("host") || "localhost";
    const hostname = host.split(":")[0]?.toLowerCase() ?? host;
    const [orgResult, brandResult] = await Promise.allSettled([
      resolveOrganizationFromHost(host),
      resolveBrandProfile(hostname),
    ]);

    if (orgResult.status === "fulfilled") {
      if (orgResult.value) {
        context.locals.organization = orgResult.value.organization;
        context.locals.currentLocation = orgResult.value.location;
      }
    } else {
      console.log("Middleware: Error resolving organization from host");
    }

    if (brandResult.status === "fulfilled") {
      if (brandResult.value) {
        context.locals.brand = brandResult.value;
      }
    } else {
      // Don't let a brand-table outage break the request.
      console.log("Middleware: Error resolving brand profile");
    }
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

          // Resolve the admin venue picker selection. Cookie value is a
          // location UUID; we validate it against the caller's scope so
          // a stale cookie (e.g. user lost access to that location)
          // silently falls back to "no pin" instead of bleeding access.
          // Only worth checking for admins — non-admins don't surface
          // the picker.
          if (context.locals.isAdmin) {
            try {
              const cookieValue = context.cookies.get(ACTIVE_VENUE_COOKIE)?.value;
              context.locals.activeLocationId = await validateActiveVenue(
                cookieValue,
                {
                  userId: user.id,
                  userRoles: roles,
                  organizationId: context.locals.organization?.id ?? null,
                },
              );
            } catch {
              // Bad cookie or DB hiccup — treat as no pin, don't fail the
              // request. The next page render will surface the picker
              // again so the user can re-pick.
              context.locals.activeLocationId = null;
            }
          }
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

  // ---------------------------------------------------------------------
  // SoccerOne routing — brand skin keyed purely off the request host.
  //
  // SoccerOne shares the Aspire org and inventory (single-org cutover,
  // 2026-06-11); the resolver scopes data identically on every host. The
  // two branches below only decide which chrome renders where. For any
  // non-SoccerOne request, both are null and we fall through unchanged.
  // ---------------------------------------------------------------------
  const soccerOneHost = context.request.headers.get("host") ?? "";
  const soccerOneUrl = new URL(context.request.url);

  // Branch 1 — Aspire-host /soccerone/* → 301 to canonical gosoccerone.com.
  // Avoids duplicate-content SEO split. The /soccerone/* page files exist
  // as the rewrite target for Branch 2, not as a public surface on Aspire.
  if (!isSoccerOneHost(soccerOneHost)) {
    const target = getAspireToSoccerOneRedirect(soccerOneUrl.pathname);
    if (target) {
      return context.redirect(target, 301);
    }
  }

  // Branch 2 — SoccerOne-host marketing root → rewrite into soccerone/* subtree.
  // Shared routes (/register, /rentals, /dropin, /api/*) pass through
  // unchanged and serve the same org-scoped data as the Aspire site.
  if (isSoccerOneHost(soccerOneHost)) {
    const rewriteTarget = rewriteSoccerOnePath(soccerOneUrl.pathname);
    if (rewriteTarget) {
      // Compose the full URL for context.rewrite() — preserve query + hash.
      const targetUrl = new URL(rewriteTarget + soccerOneUrl.search + soccerOneUrl.hash, soccerOneUrl);
      return context.rewrite(targetUrl);
    }
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

    // Role-based admin home routing. After the role check above has confirmed
    // the user is an admin of some kind, send them to the home that matches
    // their role.
    if (user) {
      const userRoleNames = (context.locals.userRoles ?? []).map((r) => r.name);
      const isSuperAdmin = userRoleNames.includes("super_admin");
      const isLocationAdmin =
        userRoleNames.includes("location_admin") && !isSuperAdmin;

      // /admin (super_admin home) → location_admin redirected to /admin/venue
      if (pathname === "/admin" || pathname === "/admin/") {
        if (isLocationAdmin) {
          return context.redirect("/admin/venue");
        }
      }

      // location_admin is blocked from super-admin-only path prefixes.
      // /admin/unauthorized is exempt so the 403 page itself stays reachable.
      //
      // The list errs on the side of "lock by default" — anything URL-
      // reachable that hasn't been deliberately scoped per-location at the
      // query layer belongs here. Re-opening a surface to location_admins
      // requires both (a) removing it from this list and (b) confirming the
      // page + its backing API filter by `getLocationIdsForUser`.
      const SUPER_ADMIN_ONLY_PREFIXES = [
        "/admin/seasons",
        "/admin/programs",
        "/admin/sports",
        "/admin/age-groups",
        // Casual play (drop-ins + rentals) is venue-manager scope as of SP2:
        // the list/detail/create pages render for location_admin and their
        // backing APIs filter by getLocationIdsForUser. Only the org-level
        // rate cards stay super-admin (pricing is per-org, not per-venue).
        "/admin/dropin/rate-card",
        "/admin/rentals/rate-card",
        "/admin/refunds",
        "/admin/discount-codes",
        "/admin/gear",
        "/admin/branding",
        "/admin/curriculum",
        "/admin/compliance",
        "/admin/users",
        "/admin/organizations",
        "/admin/settings",
        "/admin/campaigns",
        "/admin/re-registration-campaign",
        "/admin/locations",
        "/admin/venues",
        // Added 2026-05-24 (backlog #26): URL-reachable surfaces that
        // weren't in venue-manager nav but had no role gate, so a
        // location_admin typing the URL got org-wide data.
        "/admin/registrations",
        "/admin/teams",
        "/admin/games",
        "/admin/payments",
        "/admin/reports",
        // /admin/announcements was super-only between #26 and #28
        // because announcements had no per-location field. Backlog #28
        // added `announcements.location_id`: NULL = org-wide
        // (super-only), non-null = venue-scoped. The endpoint enforces
        // the tiered write permission itself, so the URL is now
        // venue-visible again.
        "/admin/broadcasts",
        // Added in backlog #30 closeout: three more URL-reachable
        // admin surfaces that were super-admin-by-intent but had no
        // gate. game-day + activity-completions are the super-admin
        // oversight view of curriculum tracking (coaches use the
        // separate /coach/* surface for the same data). /admin/media
        // is the super-admin management UI for the media program;
        // media_staff/media_editor users access the customer-facing
        // /media surface, not /admin/media.
        "/admin/game-day",
        "/admin/activity-completions",
        "/admin/media",
        "/admin/drop-league",
      ];
      if (
        isLocationAdmin &&
        SUPER_ADMIN_ONLY_PREFIXES.some(
          (p) => pathname === p || pathname.startsWith(p + "/"),
        )
      ) {
        return context.redirect("/admin/unauthorized");
      }

      // /admin/venue/** is for venue managers and super-admins (super can use
      // it to test the venue-manager flow). Non-admins fall through; they're
      // already blocked by the ROUTE_RULES role check above, so this only
      // catches edge cases.
      if (
        !isLocationAdmin &&
        !isSuperAdmin &&
        (pathname === "/admin/venue" || pathname.startsWith("/admin/venue/"))
      ) {
        return context.redirect("/admin/unauthorized");
      }
    }
  }

  return next();
});

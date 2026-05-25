import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth";
import {
  ACTIVE_VENUE_COOKIE,
  ACTIVE_VENUE_COOKIE_MAX_AGE,
  getPickableVenues,
  validateActiveVenue,
} from "@/lib/admin/active-venue";

export const prerender = false;

/**
 * GET /api/admin/active-venue
 *
 * Returns the picker's own state: which venues to offer, and which one
 * (if any) is currently pinned. The picker is mounted in `AdminLayout`
 * and self-fetches this on hydrate — keeps the .astro pages from having
 * to thread two new props through every admin route.
 *
 * Body: { venues: Array<{ id, name }>, activeLocationId: string | null }
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const venues = await getPickableVenues({
    userId: auth.user.id,
    userRoles: auth.roles,
    organizationId: context.locals.organization?.id ?? null,
  });

  return new Response(
    JSON.stringify({
      venues,
      activeLocationId: context.locals.activeLocationId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

/**
 * POST /api/admin/active-venue
 *
 * Set or clear the admin's venue-picker selection. Body:
 *   { locationId: string }  → pin to that location (validated against
 *                              the caller's scope; rejects with 400 if
 *                              not allowed)
 *   { locationId: null }    → clear the pin (revert to full scope)
 *
 * Both branches return 204; the client decides whether to re-render in
 * place (we don't redirect server-side because the picker is a fragment,
 * not a form-submit).
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const candidate =
    body && typeof body === "object" && "locationId" in body
      ? (body as { locationId: unknown }).locationId
      : undefined;

  // Clear branch: explicit null or empty string.
  if (candidate === null || candidate === "") {
    context.cookies.delete(ACTIVE_VENUE_COOKIE, { path: "/" });
    return new Response(null, { status: 204 });
  }

  if (typeof candidate !== "string") {
    return jsonError("locationId must be a string or null", 400);
  }

  // Re-validate server-side — the picker UI only shows the caller's
  // allowed locations, but we don't trust the client to enforce that.
  const valid = await validateActiveVenue(candidate, {
    userId: auth.user.id,
    userRoles: auth.roles,
    organizationId: context.locals.organization?.id ?? null,
  });
  if (!valid) {
    return jsonError("Not a venue you can pin", 400);
  }

  context.cookies.set(ACTIVE_VENUE_COOKIE, valid, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: ACTIVE_VENUE_COOKIE_MAX_AGE,
  });
  return new Response(null, { status: 204 });
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

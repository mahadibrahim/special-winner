import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth";
import { getCallerLocations } from "@/lib/admin/active-venue";

export const prerender = false;

/**
 * GET /api/admin/announcements/scope-options
 *
 * Sidecar for the announcements editor. Returns the set of scopes the
 * caller is allowed to post at, plus the venue currently pinned (if
 * any) so the editor can default sensibly.
 *
 * Body shape:
 *   {
 *     canPostOrgWide: boolean,           // true only for super_admin
 *     locations:     Array<{ id, name }>, // org locations for super,
 *                                          //  caller's scope otherwise
 *     activeLocationId: string | null     // current picker selection
 *   }
 *
 * Validation of the chosen scope still happens server-side in the
 * announcements POST/PUT handlers — this endpoint exists for UI
 * defaults and option lists, nothing else.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const isSuper = auth.roles.some((r) => r.name === "super_admin");
  const locationsList = await getCallerLocations({
    userId: auth.user.id,
    userRoles: auth.roles,
    organizationId: context.locals.organization?.id ?? null,
  });

  return new Response(
    JSON.stringify({
      canPostOrgWide: isSuper,
      locations: locationsList,
      activeLocationId: context.locals.activeLocationId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

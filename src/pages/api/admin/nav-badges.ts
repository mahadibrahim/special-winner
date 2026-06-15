import type { APIRoute } from "astro";
import { getNavBadges } from "@/lib/admin/nav-badges";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

const ZERO = { inbox: 0, refundsPending: 0, attention: 0 };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roles = (locals.userRoles ?? []).map((r) => r.name);
  const isAdmin = roles.includes("super_admin") || roles.includes("location_admin");
  if (!isAdmin) return json({ error: "Forbidden" }, 403);
  const orgId = locals.organization?.id;
  if (!orgId) return json(ZERO);

  try {
    if (roles.includes("super_admin")) {
      return json(await getNavBadges(orgId));
    }
    const locationIds = await getLocationIdsForUser(locals.user.id);
    return json(await getNavBadges(orgId, { locationIds, userId: locals.user.id }));
  } catch (err) {
    console.error("[nav-badges] failed", err);
    return json(ZERO);
  }
};

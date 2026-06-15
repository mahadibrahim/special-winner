import type { APIRoute } from "astro";
import { getNavBadges } from "@/lib/admin/nav-badges";

export const prerender = false;

const ZEROS = { inbox: 0, refundsPending: 0, attention: 0 };

/**
 * GET /api/admin/nav-badges — super-admin only. Returns badge counts for the
 * admin sidebar nav (inbox, refunds pending, attention items).
 * Fails soft: any error returns zeros rather than a 500.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!locals.organization) {
    return json(ZEROS, 200);
  }
  const userRoles = (locals.userRoles ?? []).map((r) => r.name);
  if (!userRoles.includes("super_admin")) {
    return json({ error: "Forbidden" }, 403);
  }
  try {
    const badges = await getNavBadges(locals.organization.id);
    return json(badges, 200);
  } catch (err) {
    console.error("[nav-badges] failed to fetch badge counts:", err);
    return json(ZEROS, 200);
  }
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

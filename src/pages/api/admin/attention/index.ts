import type { APIRoute } from "astro";
import { getAttentionFeed } from "@/lib/admin/attention-feed";

export const prerender = false;

/**
 * GET /api/admin/attention — super-admin only. Returns the org-scoped
 * needs-your-attention queue for the home page panel.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!locals.organization) {
    return json({ items: [] }, 200);
  }
  const userRoles = (locals.userRoles ?? []).map((r) => r.name);
  if (!userRoles.includes("super_admin")) {
    return json({ error: "Forbidden" }, 403);
  }
  const items = await getAttentionFeed(locals.organization.id);
  return json({ items }, 200);
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

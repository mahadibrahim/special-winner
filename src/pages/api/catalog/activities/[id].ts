/**
 * GET /api/catalog/activities/:id
 *
 * Returns the activity definition from the in-process catalog cache.
 *
 * The ops catalog is org-agnostic content (YAML in the repo), so this
 * endpoint only checks that a session exists — no tenant scoping is
 * required because no org-owned data is exposed.
 */
import type { APIRoute } from "astro";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const id = params.id;
  if (!id) return json({ error: "id required" }, 400);

  const activity = await getActivityFromCatalog(id);
  if (!activity) return json({ error: "Not found" }, 404);

  return json(activity, 200);
};

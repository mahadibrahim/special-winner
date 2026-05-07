/**
 * GET /api/catalog/activities
 *
 * Returns the list of activities from the YAML ops catalog. Used by the
 * today dashboard to map `activityId` → activity name + phase for the
 * by-phase tab and the type-ahead search filter.
 *
 * The ops catalog is org-agnostic content (YAML in the repo), so this
 * endpoint only checks that a session exists.
 */
import type { APIRoute } from "astro";
import { getCatalog } from "@/lib/activity-tracking/catalog-cache";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const catalog = await getCatalog();
  // Return the projection the dashboard cares about — keeps the payload small.
  const activities = catalog.activities
    .map((a) => ({
      id: a.id,
      name: a.name,
      phase: a.phase,
      raci: { responsible: a.raci.responsible },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return json({ activities }, 200);
};

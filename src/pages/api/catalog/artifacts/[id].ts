/**
 * GET /api/catalog/artifacts/:id
 *
 * Returns an artifact template (checklist/form/signature/etc.) from the
 * in-process catalog cache. Used by the activity-completion renderer
 * pages to fetch the schema needed to draw their UI.
 *
 * Org-agnostic — only requires an authenticated session.
 */
import type { APIRoute } from "astro";
import { getArtifactTemplate } from "@/lib/activity-tracking/catalog-cache";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const id = params.id;
  if (!id) return json({ error: "id required" }, 400);

  const tpl = await getArtifactTemplate(id);
  if (!tpl) return json({ error: "Not found" }, 404);

  return json(tpl, 200);
};

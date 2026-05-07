/**
 * GET /api/catalog/roles
 *
 * Returns the list of roles from the YAML ops catalog. Optional filter
 * `?kind=worker|customer|system` narrows by role kind.
 *
 * The ops catalog is org-agnostic content (YAML in the repo), so this
 * endpoint only checks that a session exists — no tenant scoping is
 * required because no org-owned data is exposed.
 */
import type { APIRoute } from "astro";
import { getCatalog } from "@/lib/activity-tracking/catalog-cache";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const kind = url.searchParams.get("kind");
  const catalog = await getCatalog();

  let roles = catalog.roles;
  if (kind) {
    roles = roles.filter((r) => r.kind === kind);
  }

  // Sort alphabetically by id for stable UI.
  const sorted = [...roles].sort((a, b) => a.id.localeCompare(b.id));
  return json({ roles: sorted }, 200);
};

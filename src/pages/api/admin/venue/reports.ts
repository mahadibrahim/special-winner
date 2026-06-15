import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { getVenueReports } from "@/lib/admin/venue-reports";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Every location id in the org (used to materialize the super-admin "all" case). */
async function allOrgLocationIds(orgId: string | undefined): Promise<string[]> {
  if (!orgId) return [];
  const rows = await getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));
  return rows.map((r) => r.id);
}

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roles = (locals.userRoles ?? []).map((r) => r.name);
  if (!roles.includes("super_admin") && !roles.includes("location_admin")) {
    return json({ error: "Forbidden" }, 403);
  }

  const period = url.searchParams.get("period") === "week" ? "week" : "today";

  // null = super-admin (all locations) → materialize to every org location id.
  const scoped = await getEffectiveLocationIds({
    userId: locals.user.id,
    userRoles: locals.userRoles ?? [],
    activeLocationId: locals.activeLocationId ?? null,
  });
  const ids = scoped ?? (await allOrgLocationIds(locals.organization?.id));
  return json({ report: await getVenueReports(ids, period, new Date()) });
};

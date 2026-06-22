import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { getEffectiveLocationIds, allOrgLocationIds } from "@/lib/admin/active-venue";
import { getVenueRosters } from "@/lib/admin/venue-rosters";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const { locals } = context;

  // null = super-admin (all locations) → materialize to every org location id.
  const scoped = await getEffectiveLocationIds({
    userId: locals.user!.id,
    userRoles: locals.userRoles ?? [],
    activeLocationId: locals.activeLocationId ?? null,
  });
  const ids = scoped ?? (await allOrgLocationIds(orgId));
  return json({ teams: await getVenueRosters(ids) });
};

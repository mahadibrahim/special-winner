import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth/roles";
import { getEffectiveLocationIds, allOrgLocationIds } from "@/lib/admin/active-venue";
import { getVenueReports } from "@/lib/admin/venue-reports";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const { locals, url } = context;

  const period = url.searchParams.get("period") === "week" ? "week" : "today";

  // null = super-admin (all locations) → materialize to every org location id.
  const scoped = await getEffectiveLocationIds({
    userId: locals.user!.id,
    userRoles: locals.userRoles ?? [],
    activeLocationId: locals.activeLocationId ?? null,
  });
  const ids = scoped ?? (await allOrgLocationIds(locals.organization?.id));
  return json({ report: await getVenueReports(ids, period, new Date()) });
};

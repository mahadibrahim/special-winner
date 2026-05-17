import type { APIRoute } from "astro";
import { getVenueDayData } from "@/lib/admin/venue-day-data";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { requireSameLocation } from "@/lib/auth/require-resource-ownership";
import { parseStripDate } from "@/lib/admin/week-strip";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const date = params.date;
  if (!date || !parseStripDate(date)) {
    return new Response(JSON.stringify({ error: "Invalid date" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const locationId = url.searchParams.get("locationId");
  if (!locationId) {
    return new Response(JSON.stringify({ error: "Missing locationId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // super_admins can read any location. location_admins are scoped via
  // requireSameLocation; the 404 vs 403 distinction is deliberate (per the
  // existing requireSameOrg* pattern: don't leak existence).
  const userRoleNames = (locals.userRoles ?? []).map((r) => r.name);
  const isSuperAdmin = userRoleNames.includes("super_admin");

  if (!isSuperAdmin) {
    const allowedIds = await getLocationIdsForUser(locals.user.id);
    const check = requireSameLocation(allowedIds, locationId);
    if (!check.ok) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
  }

  try {
    const data = await getVenueDayData(locationId, date);
    if (!data) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // Without this catch, a query failure inside getVenueDayData would
    // bubble out of the route as an unhandled 500 with no body — the
    // home-page card would then stay on "Loading…" forever instead of
    // surfacing the failure.
    console.error("[/api/admin/venue-day] getVenueDayData failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to load venue day" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
};

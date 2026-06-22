/**
 * GET /api/admin/person/[id]?as=family_member|user
 *
 * Returns a type-discriminated `PersonProfile` for a person.
 * Admin-gated. Tenant-scoped: 404 if the person does not belong to the
 * caller's org. 400 on bad `as` param.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { buildPersonProfile } from "@/lib/person/build-person-profile";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Person ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(context.request.url);
  const asParam = url.searchParams.get("as");
  if (asParam !== "family_member" && asParam !== "user") {
    return new Response(
      JSON.stringify({ error: "Query param `as` must be `family_member` or `user`" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // ---- Resolve effective location ids (mirrors lookup.ts) ----------------
    const effectiveIds = await getEffectiveLocationIds({
      userId: auth.user.id,
      userRoles: auth.roles,
      activeLocationId: context.locals.activeLocationId,
    });

    let allowedLocationIds: string[];
    if (effectiveIds === null) {
      // Super-admin with no pin: all locations in org.
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, auth.organizationId));
      allowedLocationIds = orgLocations.map((l) => l.id);
    } else if (effectiveIds.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      allowedLocationIds = effectiveIds;
    }

    const profile = await buildPersonProfile({
      id,
      as: asParam,
      orgId: auth.organizationId,
      allowedLocationIds,
    });

    if (!profile) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[/api/admin/person/[id]]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

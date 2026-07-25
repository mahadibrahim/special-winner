import type { APIRoute } from "astro";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchStores, merchOrders, teams, seasons, programs } from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { requireSameOrgTeam, ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { listStores, getStoreById, getStoreBySlug, getGeneralStore, generateShareToken } from "@/lib/merch/stores";
import { slugifyName } from "@/lib/merch/map-sync-product";

const storeSchema = z.object({
  scope: z.enum(["general", "league", "team"]),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(140).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  visibility: z.enum(["public", "unlisted"]).default("public"),
  teamId: z.string().uuid().optional().nullable(),
  orderOpensAt: z.string().datetime().optional().nullable(),
  orderClosesAt: z.string().datetime().optional().nullable(),
  pickupLocation: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Derives a unique slug for the org: uses the client-provided slug (slugified)
 *  when present, otherwise slugifies the name. Appends -2, -3, ... on collision.
 *  `excludeId` lets an update keep its own slug without colliding with itself. */
async function uniqueSlug(orgId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugifyName(base) || "store";
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const existing = await getStoreBySlug(orgId, candidate);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const stores = await listStores(auth.organizationId);
    const orgTeams = await getDb()
      .select({ id: teams.id, name: teams.name, seasonName: seasons.name, programName: programs.name })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(locations.organizationId, auth.organizationId))
      .orderBy(asc(teams.name));
    return json({ stores, teams: orgTeams });
  } catch (error) {
    console.error("Error fetching merch stores:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const parsed = storeSchema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const d = parsed.data;

    if (d.scope === "team") {
      if (!d.teamId) return json({ error: "teamId is required when scope is 'team'" }, 400);
      const owns = await requireSameOrgTeam(auth.organizationId, d.teamId);
      if (!owns.ok) return ownershipDeniedResponse();
    }

    if (d.scope === "general") {
      const existingGeneral = await getGeneralStore(auth.organizationId);
      if (existingGeneral) {
        return json({ error: "This organization already has a general store." }, 409);
      }
    }

    const slug = await uniqueSlug(auth.organizationId, d.slug ?? d.name);

    const [store] = await getDb().insert(merchStores).values({
      organizationId: auth.organizationId,
      scope: d.scope,
      teamId: d.scope === "team" ? d.teamId : null,
      name: d.name,
      slug,
      description: d.description ?? null,
      visibility: d.visibility,
      shareToken: d.visibility === "unlisted" ? generateShareToken() : null,
      orderOpensAt: d.orderOpensAt ? new Date(d.orderOpensAt) : null,
      orderClosesAt: d.orderClosesAt ? new Date(d.orderClosesAt) : null,
      pickupLocation: d.pickupLocation ?? null,
      active: d.active,
    }).returning();
    return json({ store }, 201);
  } catch (error) {
    console.error("Error creating merch store:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const body = await context.request.json().catch(() => null);
    const id = body?.id;
    if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "Valid id required" }, 400);

    const existing = await getStoreById(auth.organizationId, id);
    if (!existing) return json({ error: "Not found" }, 404);

    const parsed = storeSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const d = parsed.data;

    if (d.scope === "team") {
      if (!d.teamId) return json({ error: "teamId is required when scope is 'team'" }, 400);
      const owns = await requireSameOrgTeam(auth.organizationId, d.teamId);
      if (!owns.ok) return ownershipDeniedResponse();
    }

    if (d.scope === "general" && existing.scope !== "general") {
      const existingGeneral = await getGeneralStore(auth.organizationId);
      if (existingGeneral && existingGeneral.id !== id) {
        return json({ error: "This organization already has a general store." }, 409);
      }
    }

    const slug = await uniqueSlug(auth.organizationId, d.slug ?? d.name, id);

    const [store] = await getDb().update(merchStores).set({
      scope: d.scope,
      teamId: d.scope === "team" ? d.teamId : null,
      name: d.name,
      slug,
      description: d.description ?? null,
      visibility: d.visibility,
      shareToken: d.visibility === "unlisted" ? (existing.shareToken ?? generateShareToken()) : null,
      orderOpensAt: d.orderOpensAt ? new Date(d.orderOpensAt) : null,
      orderClosesAt: d.orderClosesAt ? new Date(d.orderClosesAt) : null,
      pickupLocation: d.pickupLocation ?? null,
      active: d.active,
      updatedAt: new Date(),
    }).where(and(eq(merchStores.id, id), eq(merchStores.organizationId, auth.organizationId))).returning();
    if (!store) return json({ error: "Not found" }, 404);
    return json({ store });
  } catch (error) {
    console.error("Error updating merch store:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "Valid id required" }, 400);

    const existing = await getStoreById(auth.organizationId, id);
    if (!existing) return json({ error: "Not found" }, 404);

    const [order] = await getDb().select({ id: merchOrders.id }).from(merchOrders)
      .where(eq(merchOrders.storeId, id)).limit(1);
    if (order) {
      return json({ error: "This store has orders — deactivate it instead." }, 409);
    }

    const [row] = await getDb().delete(merchStores)
      .where(and(eq(merchStores.id, id), eq(merchStores.organizationId, auth.organizationId))).returning();
    if (!row) return json({ error: "Not found" }, 404);
    return json({ success: true });
  } catch (error) {
    console.error("Error deleting merch store:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

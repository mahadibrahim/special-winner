/**
 * GET    /api/admin/branding/:id → single profile
 * PUT    /api/admin/branding/:id → update fields
 * DELETE /api/admin/branding/:id → soft delete via active=false (we never
 *                                  hard-delete because requests in flight
 *                                  could still resolve to a row id).
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  validateBrandProfilePut,
  type BrandProfilePutBody,
} from "@/lib/dropin/validators";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function loadOrgScoped(id: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(brandProfiles)
    .where(
      and(
        eq(brandProfiles.id, id),
        eq(brandProfiles.organizationId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  const row = await loadOrgScoped(id, orgId);
  if (!row) return json({ error: "Not found" }, 404);
  return json({ brandProfile: row }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  const existing = await loadOrgScoped(id, orgId);
  if (!existing) return json({ error: "Not found" }, 404);

  let body: BrandProfilePutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const err = validateBrandProfilePut(body);
  if (err) return json({ error: err }, 400);

  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.domain !== undefined)
    updates.domain = body.domain.trim().toLowerCase();
  if (body.displayName !== undefined)
    updates.displayName = body.displayName.trim();
  if (body.logoMediaId !== undefined) updates.logoMediaId = body.logoMediaId;
  if (body.heroCopy !== undefined) updates.heroCopy = body.heroCopy;
  if (body.colorTokens !== undefined) updates.colorTokens = body.colorTokens;
  if (body.footerCopy !== undefined) updates.footerCopy = body.footerCopy;
  if (body.featuredVenueIds !== undefined)
    updates.featuredVenueIds = body.featuredVenueIds;
  if (body.active !== undefined) updates.active = body.active;

  const [row] = await db
    .update(brandProfiles)
    .set(updates)
    .where(eq(brandProfiles.id, id))
    .returning();

  return json({ brandProfile: row }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  const existing = await loadOrgScoped(id, orgId);
  if (!existing) return json({ error: "Not found" }, 404);

  const db = getDb();
  await db
    .update(brandProfiles)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(brandProfiles.id, id));

  return json({ ok: true }, 200);
};

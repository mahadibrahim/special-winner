/**
 * GET  /api/admin/branding → list brand profiles for the active org.
 * POST /api/admin/branding → create a new brand profile (domain unique).
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
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

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  const rows = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, orgId))
    .orderBy(asc(brandProfiles.createdAt));

  return json({ brandProfiles: rows }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: BrandProfilePutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.domain || !body.displayName) {
    return json({ error: "domain and displayName required" }, 400);
  }
  const err = validateBrandProfilePut(body);
  if (err) return json({ error: err }, 400);

  const db = getDb();
  try {
    const [row] = await db
      .insert(brandProfiles)
      .values({
        organizationId: orgId,
        domain: body.domain.trim().toLowerCase(),
        displayName: body.displayName.trim(),
        logoMediaId: body.logoMediaId ?? null,
        heroCopy: body.heroCopy ?? null,
        colorTokens: body.colorTokens ?? null,
        footerCopy: body.footerCopy ?? null,
        featuredVenueIds: body.featuredVenueIds ?? [],
        active: body.active ?? true,
      })
      .returning();
    return json({ brandProfile: row }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("brand_profiles_domain")) {
      return json({ error: "Domain already in use" }, 409);
    }
    throw e;
  }
};

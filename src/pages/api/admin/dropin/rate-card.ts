/**
 * GET /api/admin/dropin/rate-card → org's rate card row (creates a default
 *                                   if missing).
 * PUT /api/admin/dropin/rate-card → upsert. Validates non-negative ints
 *                                   and reasonable bounds for the windows.
 *
 * Director-only conceptually — `requireOrgAdminAccess` gates super_admin and
 * location_admin. Tighter director-only gate is deferred to a permissions
 * pass that goes alongside the other Director-only screens.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInRateCard } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { validateRateCardPut, type RateCardPutBody } from "@/lib/dropin/validators";

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
  let [row] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, orgId))
    .limit(1);

  if (!row) {
    [row] = await db
      .insert(dropInRateCard)
      .values({ organizationId: orgId })
      .returning();
  }

  return json({ rateCard: row }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: RateCardPutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const err = validateRateCardPut(body);
  if (err) return json({ error: err }, 400);

  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedByUserId: auth.user.id,
  };
  if (body.defaultSessionRateCents !== undefined)
    updates.defaultSessionRateCents = body.defaultSessionRateCents;
  if (body.defaultMemberRateCents !== undefined)
    updates.defaultMemberRateCents = body.defaultMemberRateCents;
  if (body.defaultWalkUpRateCents !== undefined)
    updates.defaultWalkUpRateCents = body.defaultWalkUpRateCents;
  if (body.cancelWindowHours !== undefined)
    updates.cancelWindowHours = body.cancelWindowHours;
  if (body.promotionWindowMinutes !== undefined)
    updates.promotionWindowMinutes = body.promotionWindowMinutes;

  // Upsert: insert if missing, update if present.
  const [existing] = await db
    .select({ id: dropInRateCard.id })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, orgId))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(dropInRateCard)
      .set(updates)
      .where(eq(dropInRateCard.organizationId, orgId))
      .returning();
  } else {
    [row] = await db
      .insert(dropInRateCard)
      .values({ organizationId: orgId, ...updates })
      .returning();
  }
  return json({ rateCard: row }, 200);
};

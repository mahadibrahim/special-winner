/**
 * PUT    /api/admin/classes/packs/[id] → edit + reconcile Stripe Price.
 * DELETE /api/admin/classes/packs/[id] → hard-delete iff unreferenced, else 409.
 */
import type { APIRoute } from "astro";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, classPackProducts } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { applyPackStripeEdits, packInputSchema } from "@/lib/classes/admin-pack-stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadOwned(orgId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(classPackProducts)
    .where(and(eq(classPackProducts.id, id), eq(classPackProducts.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Pack id required" }, 400);

  const existing = await loadOwned(orgId, id);
  if (!existing) return json({ error: "Pack not found" }, 404);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = packInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  let priceId = existing.stripePriceId;
  if (existing.stripeProductId) {
    try {
      const result = await applyPackStripeEdits({
        productId: existing.stripeProductId,
        nameChangedTo: input.name !== existing.name ? input.name : undefined,
        oldPriceCents: existing.priceCents,
        oldPriceId: existing.stripePriceId,
        nextPriceCents: input.priceCents,
      });
      priceId = result.priceId;
    } catch (e) {
      console.error("[admin/classes/packs] stripe edit failed", e);
      return json({ error: "Could not update Stripe price" }, 502);
    }
  }

  const db = getDb();
  const [pack] = await db
    .update(classPackProducts)
    .set({
      name: input.name,
      sessionCount: input.sessionCount,
      priceCents: input.priceCents,
      expiryMonths: input.expiryMonths,
      active: input.active,
      displayOrder: input.displayOrder,
      stripePriceId: priceId,
      updatedAt: new Date(),
    })
    .where(eq(classPackProducts.id, existing.id))
    .returning();
  return json({ pack }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Pack id required" }, 400);

  const existing = await loadOwned(orgId, id);
  if (!existing) return json({ error: "Pack not found" }, 404);

  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(classCreditGrants)
    .where(eq(classCreditGrants.packProductId, existing.id));
  if (value > 0) return json({ error: "Pack has been purchased — deactivate instead" }, 409);

  await db.delete(classPackProducts).where(eq(classPackProducts.id, existing.id));
  return json({ ok: true }, 200);
};

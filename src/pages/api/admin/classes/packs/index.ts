/**
 * GET  /api/admin/classes/packs → list class packs for the active org.
 * POST /api/admin/classes/packs → create a pack + its Stripe Product/Price.
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classPackProducts } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { packInputSchema, createPackStripeObjects } from "@/lib/classes/admin-pack-stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  const packs = await db
    .select()
    .from(classPackProducts)
    .where(eq(classPackProducts.organizationId, orgId))
    .orderBy(asc(classPackProducts.displayOrder), asc(classPackProducts.createdAt));
  return json({ packs }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = packInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  let refs;
  try {
    refs = await createPackStripeObjects({ orgId, name: input.name, priceCents: input.priceCents });
  } catch (e) {
    console.error("[admin/classes/packs] stripe create failed", e);
    return json({ error: "Could not create Stripe price" }, 502);
  }

  const db = getDb();
  const [pack] = await db
    .insert(classPackProducts)
    .values({
      organizationId: orgId,
      name: input.name,
      sessionCount: input.sessionCount,
      priceCents: input.priceCents,
      expiryMonths: input.expiryMonths,
      active: input.active,
      displayOrder: input.displayOrder,
      stripeProductId: refs.productId,
      stripePriceId: refs.priceId,
    })
    .returning();
  return json({ pack }, 201);
};

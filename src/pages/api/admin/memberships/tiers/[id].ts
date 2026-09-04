/**
 * GET    /api/admin/memberships/tiers/[id] → fetch one (org-scoped).
 * PUT    /api/admin/memberships/tiers/[id] → edit + reconcile Stripe Prices.
 * DELETE /api/admin/memberships/tiers/[id] → hard-delete iff unreferenced, else 409.
 */
import type { APIRoute } from "astro";
import { eq, and, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { tierInputSchema, dollarsToCents } from "@/lib/memberships/tier-units";
import { applyTierStripeEdits } from "@/lib/memberships/admin-stripe";

export const prerender = false;
const json = (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function loadOwned(orgId: string, id: string) {
  const db = getDb();
  const [tier] = await db
    .select()
    .from(membershipTiers)
    .where(and(eq(membershipTiers.id, id), eq(membershipTiers.organizationId, orgId)))
    .limit(1);
  return tier ?? null;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const tier = await loadOwned(orgId, context.params.id!);
  if (!tier) return json({ error: "Tier not found" }, 404);
  return json({ tier }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const existing = await loadOwned(orgId, context.params.id!);
  if (!existing) return json({ error: "Tier not found" }, 404);

  let raw: unknown;
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = tierInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const nextMonthly = dollarsToCents(input.monthlyDollars);
  const nextAnnual = dollarsToCents(input.annualDollars);
  const nextFee = dollarsToCents(input.annualFeeDollars);
  const nextTechnical = dollarsToCents(input.technicalMonthlyDollars);

  let priceIds = {
    monthlyPriceId: existing.stripePriceIdMonthly,
    annualPriceId: existing.stripePriceIdAnnual,
    feePriceId: existing.stripePriceIdFee,
    technicalPriceId: existing.stripePriceIdTechnical,
  };
  if (existing.stripeProductId) {
    try {
      priceIds = await applyTierStripeEdits({
        productId: existing.stripeProductId,
        nameChangedTo: input.name !== existing.name ? input.name : undefined,
        old: {
          monthlyCents: existing.monthlyPriceCents,
          annualCents: existing.annualPriceCents,
          monthlyPriceId: existing.stripePriceIdMonthly,
          annualPriceId: existing.stripePriceIdAnnual,
          feeCents: existing.annualFeeCents,
          feePriceId: existing.stripePriceIdFee,
          technicalCents: existing.technicalMonthlyCents,
          technicalPriceId: existing.stripePriceIdTechnical,
        },
        next: {
          monthlyCents: nextMonthly,
          annualCents: nextAnnual,
          feeCents: nextFee,
          technicalCents: nextTechnical,
        },
      });
    } catch (e) {
      console.error("[admin/tiers] stripe edit failed", e);
      return json({ error: "Could not update Stripe price" }, 502);
    }
  }

  const db = getDb();
  const [tier] = await db
    .update(membershipTiers)
    .set({
      name: input.name,
      monthlyPriceCents: nextMonthly,
      annualPriceCents: nextAnnual,
      annualFeeCents: nextFee,
      technicalMonthlyCents: nextTechnical,
      tagline: input.tagline,
      benefits: input.benefits,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
      stripePriceIdMonthly: priceIds.monthlyPriceId,
      stripePriceIdAnnual: priceIds.annualPriceId,
      stripePriceIdFee: priceIds.feePriceId,
      stripePriceIdTechnical: priceIds.technicalPriceId,
      updatedAt: new Date(),
    })
    .where(eq(membershipTiers.id, existing.id))
    .returning();
  return json({ tier }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const existing = await loadOwned(orgId, context.params.id!);
  if (!existing) return json({ error: "Tier not found" }, 404);

  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.tierId, existing.id));
  if (value > 0) return json({ error: "Tier has subscribers — deactivate instead" }, 409);

  await db.delete(membershipTiers).where(eq(membershipTiers.id, existing.id));
  return json({ ok: true }, 200);
};

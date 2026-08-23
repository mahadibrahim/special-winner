/**
 * GET  /api/admin/memberships/tiers → list tiers for the active org.
 * POST /api/admin/memberships/tiers → create a tier + its Stripe Product/Prices.
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { tierInputSchema, dollarsToCents } from "@/lib/memberships/tier-units";
import { createTierStripeObjects } from "@/lib/memberships/admin-stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  const tiers = await db
    .select()
    .from(membershipTiers)
    .where(eq(membershipTiers.organizationId, orgId))
    .orderBy(asc(membershipTiers.displayOrder), asc(membershipTiers.createdAt));
  return json({ tiers }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let raw: unknown;
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = tierInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const monthlyCents = dollarsToCents(input.monthlyDollars);
  const annualCents = dollarsToCents(input.annualDollars);
  const annualFeeCents = dollarsToCents(input.annualFeeDollars);

  let refs;
  try {
    refs = await createTierStripeObjects({ orgId, name: input.name, monthlyCents, annualCents, annualFeeCents });
  } catch (e) {
    console.error("[admin/tiers] stripe create failed", e);
    return json({ error: "Could not create Stripe price" }, 502);
  }

  const db = getDb();
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId: orgId,
      name: input.name,
      monthlyPriceCents: monthlyCents,
      annualPriceCents: annualCents,
      annualFeeCents,
      tagline: input.tagline,
      benefits: input.benefits,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
      stripeProductId: refs.productId,
      stripePriceIdMonthly: refs.monthlyPriceId,
      stripePriceIdAnnual: refs.annualPriceId,
      stripePriceIdFee: refs.feePriceId,
    })
    .returning();
  return json({ tier }, 201);
};

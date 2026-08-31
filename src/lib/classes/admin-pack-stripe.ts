/**
 * Admin class-pack catalog support: input validation and Stripe
 * reconciliation for `classPackProducts`.
 *
 * IMPORTANT — Stripe here is CATALOG HYGIENE ONLY, not the source of truth
 * for what a customer pays. `POST /api/classes/packs/purchase` (Task 7)
 * ALWAYS charges via `price_data` built from the `classPackProducts` DB
 * row's `priceCents` at the moment of purchase — it never reads
 * `stripeProductId`/`stripePriceId` off the row. The Product/Price this
 * file creates and edits exist so the pack shows up correctly in the
 * Stripe Dashboard (reporting, catalog browsing) and nothing more. Do NOT
 * "fix" checkout to consume the stored Price — that would reintroduce a
 * stale-price bug the moment an admin edits `priceCents` without this
 * reconciliation completing (e.g. a failed request between the DB write
 * and the Stripe call, or simply a webhook/replay gap).
 *
 * Mirrors src/lib/memberships/admin-stripe.ts (`createFeePrice` is the
 * one-time-price pattern this reuses) and
 * src/lib/classes/admin-templates.ts's dollars-at-the-boundary shape —
 * except packs take `priceCents` directly on the wire (no dollars
 * conversion needed here; the pack-form UI does that conversion itself).
 */
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";

function s() {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const packInputSchema = z.object({
  name: z.string().trim().min(1),
  sessionCount: z.number().int().positive(),
  priceCents: z.number().int().positive(),
  expiryMonths: z.number().int().positive().default(6),
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});

export type PackInput = z.infer<typeof packInputSchema>;

// ---------------------------------------------------------------------------
// Stripe reconciliation
// ---------------------------------------------------------------------------

/** Create a Product + one-time Price for a brand-new pack. */
export async function createPackStripeObjects(opts: {
  orgId: string;
  name: string;
  priceCents: number;
}): Promise<{ productId: string; priceId: string }> {
  const product = await s().products.create({
    name: opts.name,
    metadata: { organization_id: opts.orgId, kind: "class_pack" },
  });
  const price = await s().prices.create({
    product: product.id,
    unit_amount: opts.priceCents,
    currency: "usd",
  });
  return { productId: product.id, priceId: price.id };
}

/**
 * Apply edits: rename the product, and — if the price changed —
 * create-then-archive a new one-time Price (never mutate a Price's amount
 * in place; Stripe Prices are immutable on `unit_amount`).
 */
export async function applyPackStripeEdits(opts: {
  productId: string;
  nameChangedTo?: string;
  oldPriceCents: number;
  oldPriceId: string | null;
  nextPriceCents: number;
}): Promise<{ priceId: string | null }> {
  if (opts.nameChangedTo) {
    await s().products.update(opts.productId, { name: opts.nameChangedTo });
  }

  if (opts.oldPriceCents === opts.nextPriceCents) {
    return { priceId: opts.oldPriceId };
  }

  const newPrice = await s().prices.create({
    product: opts.productId,
    unit_amount: opts.nextPriceCents,
    currency: "usd",
  });
  if (opts.oldPriceId) {
    await s().prices.update(opts.oldPriceId, { active: false });
  }
  return { priceId: newPrice.id };
}

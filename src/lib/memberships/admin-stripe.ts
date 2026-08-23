import { stripe } from "@/lib/stripe/client";
import { diffTierPrices, type Interval } from "@/lib/memberships/tier-price-diff";

function s() {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe;
}

export type StripeTierRefs = {
  productId: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  feePriceId: string | null;
};

async function createPrice(productId: string, interval: Interval, amountCents: number): Promise<string> {
  const price = await s().prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval },
  });
  return price.id;
}

/** One-time Price for the annual membership fee (rides the first invoice
 *  and each anniversary's invoice item — not a recurring Price). */
export async function createFeePrice(
  productId: string,
  amountCents: number,
): Promise<string> {
  const price = await s().prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
  });
  return price.id;
}

/** Create a Product + recurring Prices for a brand-new tier. */
export async function createTierStripeObjects(opts: {
  orgId: string;
  name: string;
  monthlyCents: number | null;
  annualCents: number | null;
  annualFeeCents: number | null;
}): Promise<StripeTierRefs> {
  const product = await s().products.create({
    name: opts.name,
    metadata: { organization_id: opts.orgId, kind: "membership_tier" },
  });
  const monthlyPriceId = opts.monthlyCents != null ? await createPrice(product.id, "month", opts.monthlyCents) : null;
  const annualPriceId = opts.annualCents != null ? await createPrice(product.id, "year", opts.annualCents) : null;
  const feePriceId =
    opts.annualFeeCents != null
      ? await createFeePrice(product.id, opts.annualFeeCents)
      : null;
  return { productId: product.id, monthlyPriceId, annualPriceId, feePriceId };
}

/** Apply edits: rename product, create/archive/replace prices. Grandfathers existing subs. */
export async function applyTierStripeEdits(opts: {
  productId: string;
  nameChangedTo?: string;
  old: {
    monthlyCents: number | null;
    annualCents: number | null;
    monthlyPriceId: string | null;
    annualPriceId: string | null;
    feeCents: number | null;
    feePriceId: string | null;
  };
  next: { monthlyCents: number | null; annualCents: number | null; feeCents: number | null };
}): Promise<{ monthlyPriceId: string | null; annualPriceId: string | null; feePriceId: string | null }> {
  if (opts.nameChangedTo) {
    await s().products.update(opts.productId, { name: opts.nameChangedTo });
  }
  let monthlyPriceId = opts.old.monthlyPriceId;
  let annualPriceId = opts.old.annualPriceId;

  for (const a of diffTierPrices(opts.old, opts.next)) {
    if (a.action === "noop") continue;
    if (a.action === "archive") {
      await s().prices.update(a.oldPriceId, { active: false });
      if (a.interval === "month") monthlyPriceId = null; else annualPriceId = null;
    } else if (a.action === "create") {
      const id = await createPrice(opts.productId, a.interval, a.amountCents);
      if (a.interval === "month") monthlyPriceId = id; else annualPriceId = id;
    } else { // replace
      const id = await createPrice(opts.productId, a.interval, a.amountCents);
      await s().prices.update(a.oldPriceId, { active: false });
      if (a.interval === "month") monthlyPriceId = id; else annualPriceId = id;
    }
  }

  let feePriceId = opts.old.feePriceId;
  if (opts.old.feeCents !== opts.next.feeCents) {
    if (opts.next.feeCents != null) {
      // Create-then-archive, matching the interval-price "replace" branch
      // above — never leave stripePriceIdFee pointing at an archived Price
      // if createFeePrice throws.
      const newFeePriceId = await createFeePrice(opts.productId, opts.next.feeCents);
      if (opts.old.feePriceId) {
        await s().prices.update(opts.old.feePriceId, { active: false });
      }
      feePriceId = newFeePriceId;
    } else if (opts.old.feePriceId) {
      await s().prices.update(opts.old.feePriceId, { active: false });
      feePriceId = null;
    }
  }

  return { monthlyPriceId, annualPriceId, feePriceId };
}

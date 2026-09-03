import { stripe } from "@/lib/stripe/client";
import { diffTierPrices, diffSupplementPrice, type Interval } from "@/lib/memberships/tier-price-diff";

function s() {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe;
}

export type StripeTierRefs = {
  productId: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  feePriceId: string | null;
  technicalPriceId: string | null;
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

/** Recurring monthly Price for the technical-training supplement — rides
 *  the subscription forever, like the tier's own monthly price, layered on
 *  top of it as a separate subscription item. */
export async function createTechnicalPrice(
  productId: string,
  unitAmountCents: number,
): Promise<string> {
  const price = await s().prices.create({
    product: productId,
    unit_amount: unitAmountCents,
    currency: "usd",
    recurring: { interval: "month" },
    nickname: "Technical training supplement",
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
  technicalMonthlyCents: number | null;
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
  const technicalPriceId =
    opts.technicalMonthlyCents != null
      ? await createTechnicalPrice(product.id, opts.technicalMonthlyCents)
      : null;
  return { productId: product.id, monthlyPriceId, annualPriceId, feePriceId, technicalPriceId };
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
    technicalCents: number | null;
    technicalPriceId: string | null;
  };
  next: {
    monthlyCents: number | null;
    annualCents: number | null;
    feeCents: number | null;
    technicalCents: number | null;
  };
}): Promise<{
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  feePriceId: string | null;
  technicalPriceId: string | null;
}> {
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
  const feeAction = diffSupplementPrice(opts.old.feeCents, opts.old.feePriceId, opts.next.feeCents);
  if (feeAction.action === "create") {
    feePriceId = await createFeePrice(opts.productId, feeAction.amountCents);
  } else if (feeAction.action === "archive") {
    await s().prices.update(feeAction.oldPriceId, { active: false });
    feePriceId = null;
  } else if (feeAction.action === "replace") {
    // Create-then-archive — never leave stripePriceIdFee pointing at an
    // archived Price if createFeePrice throws.
    const newFeePriceId = await createFeePrice(opts.productId, feeAction.amountCents);
    await s().prices.update(feeAction.oldPriceId, { active: false });
    feePriceId = newFeePriceId;
  }

  let technicalPriceId = opts.old.technicalPriceId;
  const technicalAction = diffSupplementPrice(
    opts.old.technicalCents,
    opts.old.technicalPriceId,
    opts.next.technicalCents,
  );
  if (technicalAction.action === "create") {
    technicalPriceId = await createTechnicalPrice(opts.productId, technicalAction.amountCents);
  } else if (technicalAction.action === "archive") {
    await s().prices.update(technicalAction.oldPriceId, { active: false });
    technicalPriceId = null;
  } else if (technicalAction.action === "replace") {
    // Create-then-archive, same ordering as the fee price above.
    const newTechnicalPriceId = await createTechnicalPrice(opts.productId, technicalAction.amountCents);
    await s().prices.update(technicalAction.oldPriceId, { active: false });
    technicalPriceId = newTechnicalPriceId;
  }

  return { monthlyPriceId, annualPriceId, feePriceId, technicalPriceId };
}

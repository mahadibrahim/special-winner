import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { findTechnicalAddonItem } from "@/lib/memberships/technical-addon";

/** Minimal fixture — only the fields findTechnicalAddonItem reads. */
function item(id: string, priceId: string, kind?: string): Stripe.SubscriptionItem {
  return {
    id,
    price: { id: priceId, metadata: kind ? { kind } : {} },
  } as unknown as Stripe.SubscriptionItem;
}

describe("findTechnicalAddonItem", () => {
  it("matches by the technical_supplement metadata stamp even when the price id has moved on", () => {
    // Simulates a $ edit: the item is still on the OLD (now-archived) price
    // id, but carries the metadata stamp from when it was created.
    const items = [item("si_1", "price_old", "technical_supplement")];
    const found = findTechnicalAddonItem(items, "price_new");
    expect(found?.id).toBe("si_1");
  });

  it("falls back to a same-id match for pre-metadata items", () => {
    const items = [item("si_1", "price_legacy")]; // no metadata stamp
    const found = findTechnicalAddonItem(items, "price_legacy");
    expect(found?.id).toBe("si_1");
  });

  it("does not fall back to id match when currentPriceId is null (removal case)", () => {
    const items = [item("si_1", "price_legacy")]; // no metadata, no current price to compare
    const found = findTechnicalAddonItem(items, null);
    expect(found).toBeUndefined();
  });

  it("still finds a metadata-stamped item when currentPriceId is null (tier's supplement was removed)", () => {
    const items = [item("si_1", "price_old", "technical_supplement")];
    const found = findTechnicalAddonItem(items, null);
    expect(found?.id).toBe("si_1");
  });

  it("returns undefined when no item matches either strategy", () => {
    const items = [item("si_1", "price_unrelated"), item("si_2", "price_other", "some_other_kind")];
    const found = findTechnicalAddonItem(items, "price_new");
    expect(found).toBeUndefined();
  });

  it("ignores unrelated subscription items (e.g. the tier's base recurring price)", () => {
    const items = [item("si_base", "price_base_monthly"), item("si_tech", "price_tech", "technical_supplement")];
    const found = findTechnicalAddonItem(items, "price_tech");
    expect(found?.id).toBe("si_tech");
  });
});

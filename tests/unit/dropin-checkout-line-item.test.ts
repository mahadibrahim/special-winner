import { describe, it, expect } from "vitest";
import {
  dropInLineItemCopy,
  buildDropInCheckoutLineItems,
} from "@/lib/dropin/checkout-line-item";

describe("dropInLineItemCopy", () => {
  it("builds a human-readable name and description in the given timezone", () => {
    const result = dropInLineItemCopy({
      sportOrClassLabel: "Soccer",
      formatLabel: "7v7",
      // 22:00 UTC = 6:00 PM America/New_York (EDT) on Mon May 25 2026.
      startsAt: new Date("2026-05-25T22:00:00.000Z"),
      venueName: "Field 1",
      timezone: "America/New_York",
    });

    expect(result.name).toBe("Soccer · 7v7 — Drop-in");
    // Human-readable, not a raw ISO timestamp.
    expect(result.description).toContain("May 25");
    expect(result.description).toContain("6:00");
    expect(result.description).toContain("Field 1");
    expect(result.description).toContain(" · ");
    expect(result.description).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("omits the format-label segment when there is none", () => {
    const result = dropInLineItemCopy({
      sportOrClassLabel: "Pickleball",
      formatLabel: null,
      startsAt: new Date("2026-05-25T22:00:00.000Z"),
      venueName: "Court 2",
      timezone: "America/New_York",
    });

    expect(result.name).toBe("Pickleball — Drop-in");
  });

  it("falls back to a placeholder when the venue name is missing", () => {
    const result = dropInLineItemCopy({
      sportOrClassLabel: "Soccer",
      startsAt: new Date("2026-05-25T22:00:00.000Z"),
      venueName: null,
      timezone: "America/New_York",
    });

    expect(result.description).not.toContain("null");
  });
});

describe("buildDropInCheckoutLineItems", () => {
  const base = {
    sportOrClassLabel: "Soccer",
    formatLabel: "7v7",
    startsAt: new Date("2026-05-25T22:00:00.000Z"),
    venueName: "Field 1",
    timezone: "America/New_York",
    baseAmountCents: 1500,
  };

  it("puts the session at the base rate as the first line item", () => {
    const items = buildDropInCheckoutLineItems({ ...base, surchargeCents: 74 });
    expect(items[0].price_data?.unit_amount).toBe(1500);
    expect(items[0].price_data?.product_data?.name).toBe(
      "Soccer · 7v7 — Drop-in",
    );
  });

  it("adds a separate card processing fee line item for the surcharge", () => {
    const items = buildDropInCheckoutLineItems({ ...base, surchargeCents: 74 });
    expect(items).toHaveLength(2);
    expect(items[1].price_data?.product_data?.name).toBe("Card processing fee");
    expect(items[1].price_data?.unit_amount).toBe(74);
  });

  it("omits the fee line item when the surcharge is zero", () => {
    const items = buildDropInCheckoutLineItems({ ...base, surchargeCents: 0 });
    expect(items).toHaveLength(1);
  });
});

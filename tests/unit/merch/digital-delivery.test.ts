import { describe, it, expect } from "vitest";
import {
  generateDownloadToken,
  grantExpiryFrom,
  isGrantExpired,
} from "@/lib/merch/digital-delivery";
import { buildMerchLineItems, MERCH_TAX_CODE, DIGITAL_TAX_CODE } from "@/lib/merch/checkout-line-items";

describe("generateDownloadToken", () => {
  it("returns a 32-character hex string", () => {
    const token = generateDownloadToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates unique tokens on each call", () => {
    const token1 = generateDownloadToken();
    const token2 = generateDownloadToken();
    expect(token1).not.toBe(token2);
  });
});

describe("grantExpiryFrom", () => {
  it("returns a date 6 months after the input", () => {
    const purchased = new Date("2026-01-15");
    const expiry = grantExpiryFrom(purchased);
    const expected = new Date("2026-07-15");
    expect(expiry.getFullYear()).toBe(expected.getFullYear());
    expect(expiry.getMonth()).toBe(expected.getMonth());
    expect(expiry.getDate()).toBe(expected.getDate());
  });

  it("does not mutate the input date", () => {
    const purchased = new Date("2026-01-15");
    const originalTime = purchased.getTime();
    grantExpiryFrom(purchased);
    expect(purchased.getTime()).toBe(originalTime);
  });
});

describe("isGrantExpired", () => {
  it("returns true when now is past expiry", () => {
    const expiry = new Date("2026-07-15");
    const now = new Date("2026-07-16");
    expect(isGrantExpired({ expiresAt: expiry }, now)).toBe(true);
  });

  it("returns false when now is before expiry", () => {
    const expiry = new Date("2026-07-15");
    const now = new Date("2026-07-14");
    expect(isGrantExpired({ expiresAt: expiry }, now)).toBe(false);
  });

  it("returns false when now equals expiry", () => {
    const expiry = new Date("2026-07-15T12:00:00Z");
    const now = new Date("2026-07-15T12:00:00Z");
    expect(isGrantExpired({ expiresAt: expiry }, now)).toBe(false);
  });
});

describe("buildMerchLineItems with taxCode", () => {
  it("uses provided taxCode when specified", () => {
    const items = buildMerchLineItems(
      [
        {
          productName: "Digital Download",
          variantLabel: "PDF",
          unitPriceCents: 2999,
          quantity: 1,
          taxCode: DIGITAL_TAX_CODE,
        },
      ],
      "USD"
    );
    expect(items[0].price_data?.product_data?.tax_code).toBe(DIGITAL_TAX_CODE);
  });

  it("uses MERCH_TAX_CODE when taxCode is not specified", () => {
    const items = buildMerchLineItems(
      [
        {
          productName: "Jersey",
          variantLabel: "Red · XL",
          unitPriceCents: 4999,
          quantity: 2,
        },
      ],
      "USD"
    );
    expect(items[0].price_data?.product_data?.tax_code).toBe(MERCH_TAX_CODE);
  });

  it("allows mixed items with and without taxCode", () => {
    const items = buildMerchLineItems(
      [
        {
          productName: "Digital Guide",
          variantLabel: "Video",
          unitPriceCents: 1999,
          quantity: 1,
          taxCode: DIGITAL_TAX_CODE,
        },
        {
          productName: "Hat",
          variantLabel: "Blue",
          unitPriceCents: 2499,
          quantity: 1,
        },
      ],
      "USD"
    );
    expect(items[0].price_data?.product_data?.tax_code).toBe(DIGITAL_TAX_CODE);
    expect(items[1].price_data?.product_data?.tax_code).toBe(MERCH_TAX_CODE);
  });
});

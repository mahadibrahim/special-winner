import { describe, it, expect } from "vitest";
import {
  validateRateCardPut,
  validateBrandProfilePut,
} from "@/lib/dropin/validators";

describe("validateRateCardPut", () => {
  it("accepts an empty body (PUT-as-PATCH)", () => {
    expect(validateRateCardPut({})).toBeNull();
  });

  it("accepts well-formed values", () => {
    expect(
      validateRateCardPut({
        defaultSessionRateCents: 1500,
        defaultMemberRateCents: 1200,
        cancelWindowHours: 24,
        promotionWindowMinutes: 30,
      }),
    ).toBeNull();
  });

  it("rejects negative rates", () => {
    expect(validateRateCardPut({ defaultSessionRateCents: -1 })).toContain(
      "non-negative",
    );
  });

  it("rejects non-numeric rates", () => {
    expect(
      validateRateCardPut({
        defaultMemberRateCents: "1500" as unknown as number,
      }),
    ).toContain("non-negative");
  });

  it("caps cancelWindowHours at 30 days", () => {
    expect(
      validateRateCardPut({ cancelWindowHours: 24 * 31 }),
    ).toContain("unrealistic");
  });

  it("rejects sub-minute promotion windows", () => {
    expect(
      validateRateCardPut({ promotionWindowMinutes: 0 }),
    ).toContain("between 1 minute");
  });

  it("rejects promotion windows greater than 24h", () => {
    expect(
      validateRateCardPut({ promotionWindowMinutes: 24 * 60 + 1 }),
    ).toContain("between 1 minute");
  });
});

describe("validateBrandProfilePut", () => {
  it("accepts empty patch", () => {
    expect(validateBrandProfilePut({})).toBeNull();
  });

  it("accepts well-formed values", () => {
    expect(
      validateBrandProfilePut({
        domain: "example.com",
        displayName: "Example",
        colorTokens: {
          primary: "#ea580c",
          background: "#fdfaf3",
          text: "#1a1a1a",
        },
        featuredVenueIds: [],
      }),
    ).toBeNull();
  });

  it("rejects empty displayName", () => {
    expect(validateBrandProfilePut({ displayName: "  " })).toContain(
      "displayName",
    );
  });

  it("rejects malformed domain", () => {
    expect(validateBrandProfilePut({ domain: "not a domain" })).toContain(
      "hostname",
    );
  });

  it("rejects non-array featuredVenueIds", () => {
    expect(
      validateBrandProfilePut({
        featuredVenueIds: "abc" as unknown as string[],
      }),
    ).toContain("array");
  });

  it("rejects non-hex colors", () => {
    expect(
      validateBrandProfilePut({
        colorTokens: { primary: "orange" as unknown as string },
      }),
    ).toContain("hex");
  });

  it("rejects non-object colorTokens", () => {
    expect(
      validateBrandProfilePut({
        colorTokens: ["red"] as unknown as Record<string, string>,
      }),
    ).toContain("object");
  });
});

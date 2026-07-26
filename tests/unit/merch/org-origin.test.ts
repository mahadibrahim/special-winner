import { describe, it, expect } from "vitest";
import { locationToStripeAddress } from "@/lib/merch/org-origin";

describe("locationToStripeAddress", () => {
  it("maps a location row to a Stripe address", () => {
    expect(
      locationToStripeAddress({
        addressLine1: "1 Main St",
        city: "Powell",
        state: "OH",
        postalCode: "43065",
      }),
    ).toEqual({ line1: "1 Main St", city: "Powell", state: "OH", postal_code: "43065", country: "US" });
  });

  it("falls back to Ohio when fields missing", () => {
    const a = locationToStripeAddress(null);
    expect(a.state).toBe("OH");
    expect(a.country).toBe("US");
  });

  it("falls back to Ohio defaults for missing individual fields", () => {
    const a = locationToStripeAddress({ addressLine1: null, city: null, state: "OH", postalCode: null });
    expect(a.line1).toBe("—");
    expect(a.city).toBe("Columbus");
    expect(a.postal_code).toBe("43215");
    expect(a.country).toBe("US");
  });
});

import { describe, it, expect } from "vitest";
import { EMAIL_FROM, fromForBrand } from "@/lib/email";

describe("fromForBrand", () => {
  it("keeps the verified sending address, swapping only the display name", () => {
    const from = fromForBrand("soccerone");
    const address = EMAIL_FROM.match(/<([^>]+)>/)?.[1];
    expect(address).toBeTruthy();
    expect(from).toBe(`SoccerOne <${address}>`);
  });

  it("returns EMAIL_FROM verbatim for aspire and unknown brands", () => {
    expect(fromForBrand("aspire")).toBe(EMAIL_FROM);
    expect(fromForBrand(null)).toBe(EMAIL_FROM);
    expect(fromForBrand(undefined)).toBe(EMAIL_FROM);
  });
});

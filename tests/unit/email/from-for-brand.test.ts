import { describe, it, expect, afterEach, vi } from "vitest";
import { EMAIL_FROM, fromForBrand } from "@/lib/email";

describe("fromForBrand", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the verified sending address, swapping only the display name", () => {
    // Force the fallback branch: the ambient env (bws/Netlify) may set the
    // override now that gosoccerone.com is verified in Resend.
    vi.stubEnv("RESEND_FROM_EMAIL_SOCCERONE", "");
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

  it("uses RESEND_FROM_EMAIL_SOCCERONE verbatim when set (branch 1)", () => {
    vi.stubEnv("RESEND_FROM_EMAIL_SOCCERONE", "SoccerOne <hello@gosoccerone.com>");
    expect(fromForBrand("soccerone")).toBe("SoccerOne <hello@gosoccerone.com>");
  });
});

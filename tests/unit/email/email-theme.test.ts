import { describe, it, expect } from "vitest";
import {
  emailThemeFor,
  ASPIRE_EMAIL_THEME,
  SOCCERONE_EMAIL_THEME,
} from "@/lib/email/components/email-theme";

describe("email themes", () => {
  it("resolves brand strings, defaulting to aspire", () => {
    expect(emailThemeFor("soccerone")).toBe(SOCCERONE_EMAIL_THEME);
    expect(emailThemeFor("aspire")).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor(undefined)).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor(null)).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor("garbage")).toBe(ASPIRE_EMAIL_THEME);
  });

  it("aspire theme preserves the existing email design values", () => {
    expect(ASPIRE_EMAIL_THEME.tokens.cream).toBe("#F5EFE3");
    expect(ASPIRE_EMAIL_THEME.tokens.primary).toBe("#CC442C");
    expect(ASPIRE_EMAIL_THEME.logo.kind).toBe("img");
    expect(ASPIRE_EMAIL_THEME.brandName).toBe("Aspire Sports Ohio");
  });

  it("soccerone theme is dark/lime with a text wordmark", () => {
    expect(SOCCERONE_EMAIL_THEME.tokens.cream).toBe("#0a0a0d");
    expect(SOCCERONE_EMAIL_THEME.tokens.primary).toBe("#a3e635");
    expect(SOCCERONE_EMAIL_THEME.logo.kind).toBe("wordmark");
    expect(SOCCERONE_EMAIL_THEME.brandName).toBe("SoccerOne");
    expect(SOCCERONE_EMAIL_THEME.fonts.display).toContain("Anton");
  });

  it("both themes define the full token set (primitives depend on every key)", () => {
    const keys = Object.keys(ASPIRE_EMAIL_THEME.tokens).sort();
    expect(Object.keys(SOCCERONE_EMAIL_THEME.tokens).sort()).toEqual(keys);
  });
});

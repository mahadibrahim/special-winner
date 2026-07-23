import { describe, it, expect } from "vitest";
import { buildSigninRedirectHref } from "@/lib/auth/signin-redirect-href";
import { isSafeRelativePath } from "@/lib/auth/magic-link-destination";

describe("buildSigninRedirectHref", () => {
  it("encodes a bare path with no search", () => {
    expect(buildSigninRedirectHref("/register/abc-123")).toBe(
      "/signin?redirect=%2Fregister%2Fabc-123",
    );
  });

  it("carries the full path + query string", () => {
    const href = buildSigninRedirectHref("/register/abc-123", "?audience=adult&mode=individual");
    expect(href).toBe(
      "/signin?redirect=%2Fregister%2Fabc-123%3Faudience%3Dadult%26mode%3Dindividual",
    );
    const redirectValue = new URLSearchParams(href.split("?")[1]).get("redirect");
    expect(redirectValue).toBe("/register/abc-123?audience=adult&mode=individual");
  });

  it("defaults search to empty when omitted", () => {
    expect(buildSigninRedirectHref("/register/xyz")).toBe(
      buildSigninRedirectHref("/register/xyz", ""),
    );
  });

  it("round-trips through the server's same-origin guard", () => {
    const href = buildSigninRedirectHref("/register/abc-123", "?audience=adult");
    const redirectValue = new URLSearchParams(href.split("?")[1]).get("redirect");
    expect(isSafeRelativePath(redirectValue)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { resolveCanonicalUrl, normalizeAspireOrigin } from "@/lib/seo/canonical";

const ASPIRE = "https://aspiresportsohio.com";
const ASPIRE_WWW = "https://www.aspiresportsohio.com";

describe("resolveCanonicalUrl", () => {
  it("builds an Aspire canonical on the Aspire origin", () => {
    expect(resolveCanonicalUrl("aspire", "/youth", ASPIRE)).toBe(
      "https://aspiresportsohio.com/youth",
    );
  });

  it("keeps the root path as '/'", () => {
    expect(resolveCanonicalUrl("aspire", "/", ASPIRE)).toBe(
      "https://aspiresportsohio.com/",
    );
  });

  it("strips a trailing slash from non-root paths", () => {
    expect(resolveCanonicalUrl("aspire", "/youth/leagues/", ASPIRE)).toBe(
      "https://aspiresportsohio.com/youth/leagues",
    );
  });

  it("collapses SoccerOne long-form to the short public path on the SoccerOne host", () => {
    expect(resolveCanonicalUrl("soccerone", "/soccerone/leagues", ASPIRE)).toBe(
      "https://www.gosoccerone.com/leagues",
    );
  });

  it("maps the SoccerOne long-form root to the SoccerOne root", () => {
    expect(resolveCanonicalUrl("soccerone", "/soccerone", ASPIRE)).toBe(
      "https://www.gosoccerone.com/",
    );
  });

  it("falls back to the rendered path for an unmapped SoccerOne path", () => {
    expect(resolveCanonicalUrl("soccerone", "/register/abc", ASPIRE)).toBe(
      "https://www.gosoccerone.com/register/abc",
    );
  });

  it("treats a null brand as Aspire", () => {
    expect(resolveCanonicalUrl(null, "/about", ASPIRE)).toBe(
      "https://aspiresportsohio.com/about",
    );
  });

  it("collapses a SoccerOne long-form path even with a trailing slash", () => {
    expect(resolveCanonicalUrl("soccerone", "/soccerone/leagues/", ASPIRE)).toBe(
      "https://www.gosoccerone.com/leagues",
    );
  });

  // www.aspiresportsohio.com 301s to the apex, so a canonical pointing at it
  // is a canonical pointing at a redirect. PUBLIC_APP_URL is environment-set
  // and the Bitwarden secret holds the www form, so the origin must be
  // normalized rather than trusted.
  it("forces the apex host when handed a www Aspire origin", () => {
    expect(resolveCanonicalUrl("aspire", "/adult", ASPIRE_WWW)).toBe(
      "https://aspiresportsohio.com/adult",
    );
  });

  it("forces the apex host on the root path too", () => {
    expect(resolveCanonicalUrl("aspire", "/", ASPIRE_WWW)).toBe(
      "https://aspiresportsohio.com/",
    );
  });

  it("does not strip www from the SoccerOne canonical host", () => {
    // SoccerOne's canonical host genuinely is the www form — the Aspire-only
    // normalization must not reach it.
    expect(resolveCanonicalUrl("soccerone", "/soccerone/leagues", ASPIRE_WWW)).toBe(
      "https://www.gosoccerone.com/leagues",
    );
  });
});

describe("normalizeAspireOrigin", () => {
  it("strips a www subdomain", () => {
    expect(normalizeAspireOrigin(ASPIRE_WWW)).toBe(ASPIRE);
  });

  it("leaves an apex origin untouched", () => {
    expect(normalizeAspireOrigin(ASPIRE)).toBe(ASPIRE);
  });

  it("strips a trailing slash", () => {
    expect(normalizeAspireOrigin("https://www.aspiresportsohio.com/")).toBe(ASPIRE);
  });

  it("leaves localhost and preview hosts alone", () => {
    expect(normalizeAspireOrigin("http://localhost:4321")).toBe("http://localhost:4321");
    expect(normalizeAspireOrigin("https://aspire-sports-staging.netlify.app")).toBe(
      "https://aspire-sports-staging.netlify.app",
    );
  });

  it("only strips a leading www., not www inside the host", () => {
    expect(normalizeAspireOrigin("https://wwwx.example.com")).toBe(
      "https://wwwx.example.com",
    );
  });
});

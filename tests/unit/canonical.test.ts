import { describe, it, expect } from "vitest";
import { resolveCanonicalUrl } from "@/lib/seo/canonical";

const ASPIRE = "https://aspiresportsohio.com";

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
});

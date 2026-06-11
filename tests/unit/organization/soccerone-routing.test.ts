import { describe, it, expect } from "vitest";
import {
  SOCCERONE_HOSTS,
  SOCCERONE_MARKETING_REWRITES,
  SOCCERONE_CANONICAL_HOST,
  rewriteSoccerOnePath,
  getAspireToSoccerOneRedirect,
  isSoccerOneHost,
  brandFromHost,
  originForBrand,
} from "@/lib/organization/soccerone-routing";

describe("soccerone-routing — constants", () => {
  it("recognizes both apex and www as SoccerOne hosts", () => {
    expect(SOCCERONE_HOSTS).toContain("gosoccerone.com");
    expect(SOCCERONE_HOSTS).toContain("www.gosoccerone.com");
  });

  it("canonical host is www (per spec §6.1e — www-canonical, apex redirects to it)", () => {
    expect(SOCCERONE_CANONICAL_HOST).toBe("www.gosoccerone.com");
  });

  it("rewrite table maps every marketing root the spec lists", () => {
    // Spec §6.1b — these paths and only these paths rewrite.
    const expected: Record<string, string> = {
      "/": "/soccerone",
      "/leagues": "/soccerone/leagues",
      "/rent": "/soccerone/rent",
      "/pickup": "/soccerone/pickup",
      "/memberships": "/soccerone/memberships",
      "/downtown": "/soccerone/downtown",
      "/worthington": "/soccerone/worthington",
    };
    expect(SOCCERONE_MARKETING_REWRITES).toEqual(expected);
  });
});

describe("rewriteSoccerOnePath()", () => {
  it.each([
    ["/", "/soccerone"],
    ["/leagues", "/soccerone/leagues"],
    ["/rent", "/soccerone/rent"],
    ["/pickup", "/soccerone/pickup"],
    ["/memberships", "/soccerone/memberships"],
    ["/downtown", "/soccerone/downtown"],
    ["/worthington", "/soccerone/worthington"],
  ])("rewrites %s → %s", (input, expected) => {
    expect(rewriteSoccerOnePath(input)).toBe(expected);
  });

  it.each([
    "/register",
    "/rentals",
    "/dropin",
    "/signin",
    "/dashboard",
    "/api/public/seasons",
    "/leagues/extra",       // anything beyond an exact marketing-root must NOT rewrite
    "/leaguesx",            // prefix-but-not-exact must NOT rewrite
    "/soccerone",           // already inside soccerone/* — must NOT double-rewrite
    "/soccerone/leagues",
    "/static/foo.png",
    "/about",               // Aspire's about page is NOT a SoccerOne marketing root
  ])("returns null for non-marketing path %s", (input) => {
    expect(rewriteSoccerOnePath(input)).toBeNull();
  });

  it("query string and hash are preserved by the caller, not the function (function takes pathname only)", () => {
    // rewriteSoccerOnePath only sees the pathname; the middleware composes the URL.
    expect(rewriteSoccerOnePath("/leagues")).toBe("/soccerone/leagues");
  });
});

describe("getAspireToSoccerOneRedirect()", () => {
  it("returns the canonical gosoccerone.com URL for /soccerone roots", () => {
    const url = getAspireToSoccerOneRedirect("/soccerone");
    expect(url).toBe("https://www.gosoccerone.com/");
  });

  it.each([
    ["/soccerone/leagues", "https://www.gosoccerone.com/leagues"],
    ["/soccerone/rent", "https://www.gosoccerone.com/rent"],
    ["/soccerone/pickup", "https://www.gosoccerone.com/pickup"],
    ["/soccerone/memberships", "https://www.gosoccerone.com/memberships"],
    ["/soccerone/downtown", "https://www.gosoccerone.com/downtown"],
    ["/soccerone/worthington", "https://www.gosoccerone.com/worthington"],
  ])("maps %s → %s", (input, expected) => {
    expect(getAspireToSoccerOneRedirect(input)).toBe(expected);
  });

  it.each([
    "/about",
    "/leagues",
    "/register",
    "/api/public/seasons",
    "/soccerone-other",     // not the soccerone/ subtree
  ])("returns null for non-soccerone path %s", (input) => {
    expect(getAspireToSoccerOneRedirect(input)).toBeNull();
  });
});

describe("isSoccerOneHost()", () => {
  it("recognizes both SoccerOne domains", () => {
    expect(isSoccerOneHost("gosoccerone.com")).toBe(true);
    expect(isSoccerOneHost("www.gosoccerone.com")).toBe(true);
  });

  it("rejects non-SoccerOne hosts", () => {
    expect(isSoccerOneHost("aspiresports.com")).toBe(false);
    expect(isSoccerOneHost("localhost")).toBe(false);
    expect(isSoccerOneHost("powell.aspiresports.com")).toBe(false);
    expect(isSoccerOneHost("")).toBe(false);
  });

  it("normalizes the hostname (strips port, lowercases)", () => {
    expect(isSoccerOneHost("Gosoccerone.com:443")).toBe(true);
    expect(isSoccerOneHost("WWW.GoSoccerOne.com")).toBe(true);
    expect(isSoccerOneHost("localhost:4321")).toBe(false);
  });
});

describe("brandFromHost()", () => {
  it("labels SoccerOne hosts 'soccerone'", () => {
    expect(brandFromHost("gosoccerone.com")).toBe("soccerone");
    expect(brandFromHost("www.gosoccerone.com:443")).toBe("soccerone");
  });

  it("labels everything else 'aspire' (default brand)", () => {
    expect(brandFromHost("aspiresportsohio.com")).toBe("aspire");
    expect(brandFromHost("localhost:4321")).toBe("aspire");
    expect(brandFromHost("")).toBe("aspire");
  });
});

describe("originForBrand()", () => {
  it("returns the canonical SoccerOne origin for 'soccerone'", () => {
    expect(originForBrand("soccerone")).toBe("https://www.gosoccerone.com");
  });

  it("returns null for any other brand (callers fall back to PUBLIC_APP_URL)", () => {
    expect(originForBrand("aspire")).toBeNull();
    expect(originForBrand(null)).toBeNull();
    expect(originForBrand(undefined)).toBeNull();
    expect(originForBrand("")).toBeNull();
  });
});

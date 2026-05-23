import { describe, it, expect } from "vitest";
import {
  SOCCERONE_HOSTS,
  SOCCERONE_MARKETING_REWRITES,
  SOCCERONE_CANONICAL_HOST,
  rewriteSoccerOnePath,
  getAspireToSoccerOneRedirect,
  isUnmappedSoccerOneHost,
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

describe("isUnmappedSoccerOneHost()", () => {
  it("returns true when the host is a SoccerOne domain but the resolved org's slug is not 'soccerone'", () => {
    expect(isUnmappedSoccerOneHost("gosoccerone.com", null)).toBe(true);
    expect(isUnmappedSoccerOneHost("www.gosoccerone.com", null)).toBe(true);
    expect(isUnmappedSoccerOneHost("gosoccerone.com", "aspire-sports")).toBe(true);
    expect(isUnmappedSoccerOneHost("www.gosoccerone.com", "orgb")).toBe(true);
  });

  it("returns false when the SoccerOne host resolves to the SoccerOne org", () => {
    expect(isUnmappedSoccerOneHost("gosoccerone.com", "soccerone")).toBe(false);
    expect(isUnmappedSoccerOneHost("www.gosoccerone.com", "soccerone")).toBe(false);
  });

  it("returns false for non-SoccerOne hosts regardless of resolved org", () => {
    expect(isUnmappedSoccerOneHost("aspiresports.com", null)).toBe(false);
    expect(isUnmappedSoccerOneHost("localhost", "aspire-sports")).toBe(false);
    expect(isUnmappedSoccerOneHost("powell.aspiresports.com", null)).toBe(false);
  });

  it("normalizes the hostname (strips port, lowercases)", () => {
    expect(isUnmappedSoccerOneHost("Gosoccerone.com:443", null)).toBe(true);
    expect(isUnmappedSoccerOneHost("WWW.GoSoccerOne.com", "soccerone")).toBe(false);
  });
});

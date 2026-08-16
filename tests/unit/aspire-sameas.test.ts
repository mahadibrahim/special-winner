import { describe, it, expect } from "vitest";
import {
  ASPIRE_SAME_AS,
  ASPIRE_ORG_JSONLD,
  ASPIRE_WEBSITE_JSONLD,
} from "@/lib/seo/aspire-jsonld";

const GBP = "https://maps.google.com/?cid=15317658895845935462";

describe("ASPIRE_SAME_AS", () => {
  it("contains only absolute https URLs", () => {
    for (const url of ASPIRE_SAME_AS) {
      expect(url, url).toMatch(/^https:\/\//);
    }
  });

  it("contains no placeholders", () => {
    // The invariant this file exists to protect: a sameAs pointing at a dead
    // profile breaks the entity reconciliation it is meant to establish.
    for (const url of ASPIRE_SAME_AS) {
      expect(url).not.toContain("REPLACE_ME");
    }
  });

  it("has no duplicates", () => {
    expect(new Set(ASPIRE_SAME_AS).size).toBe(ASPIRE_SAME_AS.length);
  });

  it("includes the Google Business Profile listing", () => {
    expect(ASPIRE_SAME_AS).toContain(GBP);
  });

  it("pins YouTube to the immutable channel ID rather than the handle", () => {
    const yt = ASPIRE_SAME_AS.find((u) => u.includes("youtube.com"));
    expect(yt).toBe("https://www.youtube.com/channel/UC7EHJoPzl1YDRoElIH2FoLw");
    expect(yt).not.toContain("@");
  });

  it("omits TikTok, which has no account", () => {
    expect(ASPIRE_SAME_AS.some((u) => u.includes("tiktok"))).toBe(false);
  });
});

describe("Aspire organization JSON-LD", () => {
  it("emits sameAs on the org node", () => {
    expect((ASPIRE_ORG_JSONLD as Record<string, unknown>).sameAs).toEqual(
      ASPIRE_SAME_AS,
    );
  });

  it("points hasMap at the GBP listing for Worthington only", () => {
    const places = ASPIRE_ORG_JSONLD.location as Array<Record<string, unknown>>;
    const worthington = places.find((p) => String(p.name).includes("Worthington"));
    const downtown = places.find((p) => String(p.name).includes("Downtown"));
    expect(worthington?.hasMap).toBe(GBP);
    // Downtown shares its building with SoccerOne and has no separate Aspire
    // listing — a map link there would be fabricated NAP.
    expect(downtown?.hasMap).toBeUndefined();
  });

  it("links the WebSite node to the org via @id", () => {
    expect(ASPIRE_WEBSITE_JSONLD.publisher).toEqual({
      "@id": (ASPIRE_ORG_JSONLD as Record<string, unknown>)["@id"],
    });
  });
});

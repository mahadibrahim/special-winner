import { describe, it, expect } from "vitest";
import {
  WORTHINGTON_JSONLD,
  DOWNTOWN_JSONLD,
  SOCCERONE_ORG_JSONLD,
} from "@/lib/seo/soccerone-jsonld";
import { ASPIRE_ORG_JSONLD } from "@/lib/seo/aspire-jsonld";

// These entities each map 1:1 to a Google Business listing. NAP + geo + a
// sameAs link to the GBP Maps URL are what let Google reconcile the on-site
// entity with the listing, so they must not silently regress.

describe("SoccerOne venue JSON-LD (GBP reconciliation)", () => {
  for (const [label, entity, cid] of [
    ["Worthington", WORTHINGTON_JSONLD, "380177723020037394"],
    ["Downtown", DOWNTOWN_JSONLD, "12977032128879473055"],
  ] as const) {
    describe(label, () => {
      it("uses the standardized 'SoccerOne' primary name", () => {
        expect(entity.name.startsWith("SoccerOne")).toBe(true);
      });

      it("keeps the exact GBP spelling as an alternateName for matching", () => {
        expect(Array.isArray(entity.alternateName)).toBe(true);
        expect(entity.alternateName.some((n) => /Soccer ONE/.test(n))).toBe(true);
      });

      it("carries telephone, numeric geo, and a Maps sameAs/hasMap link", () => {
        expect(entity.telephone).toMatch(/^\+1-614-\d{3}-\d{4}$/);
        expect(typeof entity.geo.latitude).toBe("number");
        expect(typeof entity.geo.longitude).toBe("number");
        const mapUrl = `https://maps.google.com/?cid=${cid}`;
        expect(entity.hasMap).toBe(mapUrl);
        expect(entity.sameAs).toContain(mapUrl);
      });

      it("serializes to valid JSON", () => {
        expect(() => JSON.parse(JSON.stringify(entity))).not.toThrow();
      });
    });
  }

  it("standardizes the Downtown place name in the org-level entity", () => {
    const names = SOCCERONE_ORG_JSONLD.location.map((l) => l.name);
    expect(names).toContain("SoccerOne Downtown");
    expect(names.every((n) => !/Soccer ONE/.test(n))).toBe(true);
  });
});

describe("Aspire Organization JSON-LD venues", () => {
  it("gives both venues a street address and numeric geo", () => {
    for (const place of ASPIRE_ORG_JSONLD.location) {
      expect(place.address.streetAddress).toBeTruthy();
      expect(place.address.postalCode).toBeTruthy();
      expect(typeof place.geo.latitude).toBe("number");
      expect(typeof place.geo.longitude).toBe("number");
    }
  });

  it("adds the Aspire phone to the Worthington venue only", () => {
    const worthington = ASPIRE_ORG_JSONLD.location.find((l) =>
      l.name.includes("Worthington"),
    );
    expect(worthington && "telephone" in worthington ? worthington.telephone : null).toBe(
      "+1-614-749-9782",
    );
  });
});

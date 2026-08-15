import { describe, it, expect } from "vitest";
import { robotsTxt, soccerOneSitemapXml } from "@/lib/seo/tenant-seo";
import { SOCCERONE_MARKETING_REWRITES } from "@/lib/organization/soccerone-routing";

describe("robotsTxt", () => {
  it("points the sitemap at the requesting host, not a fixed domain", () => {
    const txt = robotsTxt("https://www.gosoccerone.com");
    expect(txt).toContain("Sitemap: https://www.gosoccerone.com/sitemap.xml");
    expect(txt).not.toContain("aspiresportsohio.com");
  });

  it("disallows portal, auth, and API surfaces", () => {
    const txt = robotsTxt("https://aspiresportsohio.com");
    for (const p of ["/admin/", "/coach/", "/dashboard/", "/api/", "/signin"]) {
      expect(txt).toContain(`Disallow: ${p}`);
    }
  });
});

describe("soccerOneSitemapXml", () => {
  it("lists every SoccerOne marketing path against the given origin", () => {
    const xml = soccerOneSitemapXml("https://www.gosoccerone.com");
    for (const path of Object.keys(SOCCERONE_MARKETING_REWRITES)) {
      const loc = path === "/" ? "https://www.gosoccerone.com/" : `https://www.gosoccerone.com${path}`;
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect(xml).not.toContain("aspiresportsohio.com");
    expect(xml).not.toContain("/soccerone/");
  });

  it("is well-formed XML with a urlset root", () => {
    const xml = soccerOneSitemapXml("https://www.gosoccerone.com");
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(xml).toContain(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("aspireSitemapXml", () => {
  it("serves the shared Aspire SSR page list and excludes private paths", async () => {
    const { aspireSitemapXml } = await import("@/lib/seo/tenant-seo");
    const xml = aspireSitemapXml("https://aspiresportsohio.com");
    for (const loc of [
      "https://aspiresportsohio.com/",
      "https://aspiresportsohio.com/youth",
      "https://aspiresportsohio.com/adult/leagues",
      "https://aspiresportsohio.com/adult/leagues/soccer",
      "https://aspiresportsohio.com/adult/leagues/flag-football",
    ]) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect(xml).not.toContain("/partners/planner");
    expect(xml).not.toContain("/admin");
  });
});

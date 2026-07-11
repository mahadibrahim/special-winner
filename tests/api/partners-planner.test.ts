import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// The SoccerOne marketing planner is an unlisted partner tool served
// verbatim by src/pages/partners/planner.ts. Its source of truth lives in
// the ops repo (marketing/data/tools/fall-fill-planner-deploy.html) — on
// tool updates, re-copy the deploy build. Never linked from nav or sitemap.
describe("GET /partners/planner", () => {
  it("serves the self-contained planner document", async () => {
    const res = await fetch(`${BASE}/partners/planner`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);

    const body = await res.text();
    expect(body).toContain("SoccerOne — League Marketing Planner");
  });

  it("stays out of search engines via meta tag and response header", async () => {
    const res = await fetch(`${BASE}/partners/planner`);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const body = await res.text();
    expect(body).toMatch(/<meta name="robots" content="noindex, nofollow">/);
  });

  it("is absent from the sitemap", async () => {
    const res = await fetch(`${BASE}/sitemap.xml`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("/partners/planner");
  });
});

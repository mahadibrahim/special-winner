import { describe, it, expect } from "vitest";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const EDGE = "public, s-maxage=60, stale-while-revalidate=86400";

const MARKETING_PATHS = [
  "/",
  "/youth",
  "/youth/leagues",
  "/youth/camps",
  "/adult",
  "/adult/leagues",
  "/adult/pickup",
  "/adult/tournaments",
  "/locations",
  "/sports",
];

describe("edge-cache headers on Aspire marketing pages", () => {
  it.each(MARKETING_PATHS)("sets Netlify-CDN-Cache-Control on GET %s", async (path) => {
    const res = await fetch(`${BASE}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("netlify-cdn-cache-control")).toBe(EDGE);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("does NOT set the edge header on a non-opted-in page (/signin)", async () => {
    const res = await fetch(`${BASE}/signin`);
    expect(res.headers.get("netlify-cdn-cache-control")).toBeNull();
  });

  it("does not bake the user's email into HTML for an authenticated request", async () => {
    const email = "parent@test.aspiresports.com";
    const cookie = await getAuthCookie(email, "TestParent123!");
    const res = await fetch(`${BASE}/`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("netlify-cdn-cache-control")).toBe(EDGE);
    const html = await res.text();
    expect(html).not.toContain(email);
  });
});

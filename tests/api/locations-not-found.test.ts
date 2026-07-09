import { describe, it, expect } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

/**
 * SEO regression guard (2026-07-08 incident): a non-existent location slug
 * used to 302-redirect to /programs. A 302 is a "temporary" signal, so
 * Google kept indexing junk location URLs (e.g. test data "loc-g00dqku7").
 * Unknown location slugs must return 404 so search engines drop them.
 */
describe("GET /locations/[slug] for an unknown slug", () => {
  it("returns 404 (not a 302 redirect) so search engines de-index it", async () => {
    const res = await fetch(
      `${BASE_URL}/locations/definitely-not-a-real-location-zzz9`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(404);
  });
});

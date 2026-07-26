import { test, expect } from "@playwright/test";
import { E2E_MERCH_UNLISTED_STORE_SLUG, E2E_MERCH_UNLISTED_STORE_TOKEN } from "@/lib/db/seeds/seed-e2e-tests";

/**
 * Merch storefront visibility (Phase 3b fast-follow 2.4).
 *
 * /shop is the org's indexable general storefront (see src/pages/shop/[slug].astro
 * for the general-store fallback and landing-pages.spec.ts's own /shop check).
 * This spec's focus is the unlisted-store gate: src/pages/shop/[slug].astro
 * 404s an unlisted store unless the request carries the matching ?k=<shareToken>,
 * and sets noindex on the page when it does render. The fixture (a stable
 * slug + shareToken) is seeded by seedMerchUnlistedStoreFixture in
 * seed-e2e-tests.ts so this spec can navigate directly instead of discovering
 * it via an admin API call.
 */

test.describe("Merch storefront visibility", () => {
  test("/shop — general store: 200, renders an h1, no noindex", async ({ page }) => {
    const response = await page.goto("/shop", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
  });

  test("unlisted store without ?k= → 404", async ({ page }) => {
    const response = await page.goto(`/shop/${E2E_MERCH_UNLISTED_STORE_SLUG}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });

  test("unlisted store with the correct ?k= → 200, renders, noindex set", async ({ page }) => {
    const response = await page.goto(
      `/shop/${E2E_MERCH_UNLISTED_STORE_SLUG}?k=${E2E_MERCH_UNLISTED_STORE_TOKEN}`,
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  });

  test("unlisted store with a wrong ?k= → 404", async ({ page }) => {
    const response = await page.goto(`/shop/${E2E_MERCH_UNLISTED_STORE_SLUG}?k=wrongtoken`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });
});

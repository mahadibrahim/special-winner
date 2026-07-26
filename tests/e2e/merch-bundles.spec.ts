import { test, expect } from "@playwright/test";
import {
  E2E_MERCH_UNLISTED_STORE_SLUG,
  E2E_MERCH_UNLISTED_STORE_TOKEN,
  E2E_MERCH_BUNDLE_SLUG,
} from "@/lib/db/seeds/seed-e2e-tests";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Merch bundle storefront (Phase 3d Task 3.3).
 *
 * The fixture (seedMerchBundleFixture in seed-e2e-tests.ts) lives in the same
 * unlisted team store as tests/e2e/merch-stores.spec.ts's jersey fixture — a
 * 2-slot bundle (jersey + shorts) at a fixed slug. Since the store is
 * unlisted, every request needs the ?k=<shareToken> query param, same as
 * merch-stores.spec.ts.
 */

const bundleUrl = `/shop/${E2E_MERCH_UNLISTED_STORE_SLUG}/bundle/${E2E_MERCH_BUNDLE_SLUG}?k=${E2E_MERCH_UNLISTED_STORE_TOKEN}`;
const storeUrl = `/shop/${E2E_MERCH_UNLISTED_STORE_SLUG}?k=${E2E_MERCH_UNLISTED_STORE_TOKEN}`;

test.describe("Merch bundle storefront", () => {
  test("bundle detail page renders name, a variant select per slot, and a price", async ({
    page,
  }) => {
    const response = await page.goto(bundleUrl, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await waitForHydration(page);

    await expect(page.locator("h1")).toContainText("E2E Team Kit Bundle");

    // Two slots (jersey + shorts) => two <select> elements, one per fieldset.
    const selects = page.locator("select");
    await expect(selects).toHaveCount(2);

    // Both variants default-selected on load, so the discounted price should
    // be visible immediately (bundle-detail.tsx pre-selects slots[0] for
    // each slot in useState initializer).
    await expect(page.getByText(/^\$\d+\.\d{2}/).first()).toBeVisible();
  });

  test("store grid links to the bundle", async ({ page }) => {
    const response = await page.goto(storeUrl, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const bundleLink = page.locator(`a[href*="/bundle/${E2E_MERCH_BUNDLE_SLUG}"]`);
    await expect(bundleLink).toHaveCount(1);
    await expect(bundleLink).toContainText("E2E Team Kit Bundle");
  });
});

import { test, expect } from "@playwright/test";

/**
 * Landing hubs + the homepage gateway + header nav.
 *
 * /youth and /adult are one-screen hubs: a server-rendered hero plus
 * category door cards (plain <a> links — no React island, so no
 * hydration wait is needed). Legacy section anchors redirect to the
 * category pages. The homepage hero/CTA-banner route into the hubs; the
 * header nav exposes audience dropdowns over the category pages.
 */

test.describe("Landing-page finders", () => {
  test("/youth — hub: hero + two category doors", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /look forward to/i }),
    ).toBeVisible();
    for (const cta of ["youth-hub-leagues", "youth-hub-camps"]) {
      await expect(page.locator(`[data-landing-cta="${cta}"]`)).toBeVisible();
    }

    await page.locator('[data-landing-cta="youth-hub-leagues"]').click();
    await expect(page).toHaveURL(/\/youth\/leagues$/);

    // Legacy age-band anchors forward to the leagues category page.
    await page.goto("/youth#ages-9-12", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/youth\/leagues$/);
  });

  test("/adult — hub: hero + three category doors", async ({ page }) => {
    await page.goto("/adult", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /build your week around/i }),
    ).toBeVisible();
    for (const cta of ["adult-hub-leagues", "adult-hub-pickup", "adult-hub-tournaments"]) {
      await expect(page.locator(`[data-landing-cta="${cta}"]`)).toBeVisible();
    }

    // No React island on the hub — door links are plain <a> navigations.
    await page.locator('[data-landing-cta="adult-hub-pickup"]').click();
    await expect(page).toHaveURL(/\/adult\/pickup$/);

    // Legacy anchor bookmarks forward to category pages.
    await page.goto("/adult#leagues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/adult\/leagues$/);
  });

  test("homepage — gateway hero CTAs route into the finders", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-landing-cta="homepage-hero-youth"]'),
    ).toHaveAttribute("href", "/youth");
    await expect(
      page.locator('[data-landing-cta="homepage-hero-adult"]'),
    ).toHaveAttribute("href", "/adult");
  });

  test("header nav — audience links with category dropdowns, no Sports", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav").first();

    for (const name of ["Youth", "Adult", "Locations", "Shop", "About"]) {
      await expect(nav.getByRole("link", { name, exact: true }).first()).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Sports", exact: true })).toHaveCount(0);

    // CSS hover dropdown — works pre-hydration.
    await nav.getByRole("link", { name: "Adult", exact: true }).hover();
    await expect(nav.getByRole("link", { name: "Pickup" })).toBeVisible();
    await nav.getByRole("link", { name: "Pickup" }).click();
    await expect(page).toHaveURL(/\/adult\/pickup$/);
  });

  test("/shop returns 200 and is noindex", async ({ page }) => {
    const response = await page.goto("/shop", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });
});

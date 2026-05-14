import { test, expect } from "@playwright/test";

test.describe("Discovery landing pages", () => {
  test("/youth loads with hero CTA and five format tiles", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /look forward to/i }),
    ).toBeVisible();

    const tiles = page.locator("[data-format-tile]");
    await expect(tiles).toHaveCount(5);

    await expect(
      page.locator('[data-format-tile="Camps"]'),
    ).toHaveAttribute("href", "/programs?audience=youth&type=camp");

    await page.locator('[data-landing-cta="youth-hero"]').click();
    await expect(page).toHaveURL(/\/programs\?audience=youth/);
  });

  test("/adult loads with two hero CTAs and a pick-up tile to /dropin", async ({ page }) => {
    await page.goto("/adult", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /build your week around/i }),
    ).toBeVisible();

    const tiles = page.locator("[data-format-tile]");
    await expect(tiles).toHaveCount(3);
    await expect(
      page.locator('[data-format-tile="Pick-up"]'),
    ).toHaveAttribute("href", "/dropin");

    await page.locator('[data-landing-cta="adult-hero-team"]').click();
    await expect(page).toHaveURL(/\/programs\?audience=team/);
  });

  test("header nav exposes the six audience-led links", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav").first();
    for (const label of ["Youth", "Adult", "Sports", "Locations", "Shop", "About"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
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

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Landing-page finders + the homepage gateway.
 *
 * /youth and /adult are in-page finders: a server-rendered hero with
 * scroll-down jump-links, a hydrated React island (YouthFinder /
 * AdultFinder) that renders a sticky section-nav plus the stacked
 * sections. The hero markup is server-rendered (assertable immediately);
 * the section <section id> anchors come from the island (assert after
 * hydration). The homepage hero/CTA-banner route into those finders.
 */

test.describe("Landing-page finders", () => {
  test("/youth — age-led finder: hero, jump-links, three age sections", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" });

    // Hero (server-rendered) — headline + the three age jump-links.
    await expect(
      page.getByRole("heading", { name: /look forward to/i }),
    ).toBeVisible();
    for (const id of ["ages-4-8", "ages-9-12", "ages-13-18"]) {
      await expect(page.locator(`a[href="#${id}"]`).first()).toBeVisible();
    }

    // Finder island hydrates → the three age <section> anchors exist.
    await waitForHydration(page);
    for (const id of ["ages-4-8", "ages-9-12", "ages-13-18"]) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }

    // A hero jump-link scrolls to its section (the hash updates).
    await page.locator('[data-landing-cta="youth-hero-9-12"]').click();
    await expect(page).toHaveURL(/#ages-9-12$/);
  });

  test("/adult — finder: hero, jump-links, three sections incl. pickup", async ({ page }) => {
    await page.goto("/adult", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /build your week around/i }),
    ).toBeVisible();
    for (const id of ["leagues", "pickup", "tournaments"]) {
      await expect(page.locator(`a[href="#${id}"]`).first()).toBeVisible();
    }

    await waitForHydration(page);
    for (const id of ["leagues", "pickup", "tournaments"]) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }

    await page.locator('[data-landing-cta="adult-hero-pickup"]').click();
    await expect(page).toHaveURL(/#pickup$/);
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

  test("header nav exposes the six audience-led links", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav").first();
    for (const label of ["Youth", "Adult", "Sports", "Locations", "Shop", "About"]) {
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
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

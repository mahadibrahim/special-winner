import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Landing hubs + the homepage gateway + header nav.
 *
 * /youth and /adult are one-screen hubs: a server-rendered hero plus
 * category door cards (plain <a> links, so no hydration wait is needed
 * to click them — the Leagues tiles carry a decorative TileFactsLine
 * island, but it never gates navigation). Legacy section anchors
 * redirect to the category pages. The homepage hero/CTA-banner route
 * into the hubs; the header nav exposes audience dropdowns over the
 * category pages.
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
      page.getByRole("heading", { name: /three ways to play/i }),
    ).toBeVisible();
    for (const cta of ["adult-hub-leagues", "adult-hub-pickup", "adult-hub-tournaments"]) {
      await expect(page.locator(`[data-landing-cta="${cta}"]`)).toBeVisible();
    }

    // Door links are plain server-rendered <a> navigations — the facts-line
    // island inside the Leagues tile never gates the click.
    await page.locator('[data-landing-cta="adult-hub-pickup"]').click();
    await expect(page).toHaveURL(/\/adult\/pickup$/);

    // Legacy anchor bookmarks forward to category pages.
    await page.goto("/adult#leagues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/adult\/leagues$/);
  });

  test("homepage — gateway hero CTAs deep-link the category pages", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-landing-cta="homepage-hero-youth"]'),
    ).toHaveAttribute("href", "/youth/leagues");
    await expect(
      page.locator('[data-landing-cta="homepage-hero-adult"]'),
    ).toHaveAttribute("href", "/adult/leagues");
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

  test("homepage — evolved sections: hero copy, benefits, strip, capture", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Benefit-led hero (server-rendered).
    await expect(
      page.getByRole("heading", { level: 1, name: /best part of your week/i }),
    ).toBeVisible();
    // .first() = the hero CTA; the CTA banner at page bottom repeats the
    // same labels (unified in #180), which strict mode otherwise rejects.
    await expect(page.getByRole("link", { name: /for kids/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /for adults/i }).first()).toBeVisible();

    // Benefit trio (static, server-rendered).
    await expect(page.getByText(/actually fun/i)).toBeVisible();

    // Open-now strip: anchor + catch-all link.
    await expect(page.locator("#programs")).toBeVisible();
    await expect(page.locator('#programs a[href="/programs"]')).toBeVisible();

    // Capture band submits (newsletter upsert is idempotent across runs).
    // client:visible — scroll the island into view, then wait for it to hydrate
    // before interacting (the React submit handler isn't attached until then).
    await waitForHydration(page);
    const captureBandIsland = page.locator(
      'astro-island[component-url*="capture-band"]',
    );
    await captureBandIsland.scrollIntoViewIfNeeded();
    await page.waitForSelector(
      'astro-island[component-url*="capture-band"]:not([ssr])',
      { timeout: 15_000 },
    );
    await page.locator("#capture-band-email").fill("home-incentive-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /send my code/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible();
  });
});

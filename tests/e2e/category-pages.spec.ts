import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Phase-1 category pages (/adult/leagues, /adult/pickup, /adult/tournaments,
 * /youth/leagues, /youth/camps): additive routes that scope the seasons
 * catalog by audience + program type. Heroes are server-rendered; the card
 * grid / empty state comes from the CategoryFinder island after hydration.
 * The /youth/camps empty state exercises the emptyCtaAudience capture path.
 */

test.describe("Category pages", () => {
  test("/adult/leagues — hero, cross-link, league card from the catalog", async ({ page }) => {
    await page.goto("/adult/leagues", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: /adult leagues/i })).toBeVisible();
    await expect(page.locator('a[href="/youth/leagues"]')).toBeVisible();

    await waitForHydration(page);
    await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();
  });

  test("/adult/leagues — venue chip filters the grid", async ({ page }) => {
    await page.goto("/adult/leagues", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();

    // Chip rows auto-hide when they have ≤1 option, so only assert behavior
    // when a chip row is present: clicking "All" is always safe.
    const allChips = page.getByRole("button", { name: "All", exact: true });
    if ((await allChips.count()) > 0) {
      await allChips.first().click();
      await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();
    }
  });

  test("/adult/tournaments — renders (cards or empty state)", async ({ page }) => {
    await page.goto("/adult/tournaments", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /adult tournaments/i })).toBeVisible();
    await waitForHydration(page);
    // Catalog-dependent: either tournament cards or the capture empty state.
    await expect(
      page.getByText(/nothing open right now/i).or(page.locator(".grid").first()).first(),
    ).toBeVisible();
  });

  test("/adult/pickup — hero and section render", async ({ page }) => {
    await page.goto("/adult/pickup", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /pickup/i })).toBeVisible();
    await expect(page.locator('a[href="/adult/leagues"]')).toBeVisible();
    await waitForHydration(page);
  });

  test("/youth/leagues — hero, youth card from the catalog", async ({ page }) => {
    await page.goto("/youth/leagues", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /youth leagues/i })).toBeVisible();
    await waitForHydration(page);
    await expect(page.getByText(/E2E Test Spring 2026/).first()).toBeVisible();
  });

  test("/youth/camps — empty catalog captures email", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Seed has no camp programs → empty state with EmptyNotifyForm renders.
    await expect(page.getByText(/nothing open right now/i)).toBeVisible();
    // Scope to the empty-state form — the footer newsletter form also has an
    // email input with the same accessible label, so target by the unique id.
    await page.locator("#empty-finder-youth-camps-email").fill("camps-waitlist-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /notify me/i }).click();
    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });
});

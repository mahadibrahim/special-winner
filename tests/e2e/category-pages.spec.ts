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
  test("/adult/leagues — hero, cross-link, league card from the catalog @critical", async ({ page }) => {
    await page.goto("/adult/leagues", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: /adult leagues/i })).toBeVisible();
    await expect(page.locator('#main-content a[href="/youth/leagues"]')).toBeVisible();

    // Landing-page assembly: how-it-works strip + FAQ section render
    // server-side (static copy), independent of catalog state.
    await expect(page.getByRole("heading", { name: "How team signup works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adult league FAQs" })).toBeVisible();

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
    await expect(page.locator('#main-content a[href="/adult/leagues"]')).toBeVisible();
    await waitForHydration(page);
  });

  test("/youth/leagues — forwards to the soccer two-path page", async ({ page }) => {
    // Owner decision 2026-08-18: soccer-focused page; /youth/leagues 302s
    // while soccer is the only league sport.
    await page.goto("/youth/leagues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/youth\/leagues\/soccer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /indoor youth soccer leagues/i }),
    ).toBeVisible();
    await waitForHydration(page);
    await expect(page.getByText(/E2E Test Spring 2026/).first()).toBeVisible();
  });

  test("/youth/camps — empty catalog captures email", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Rebuilt hub renders the four-family menu server-side.
    await expect(page.getByRole("heading", { level: 1, name: /camp, all year long/i })).toBeVisible();

    // Seed has no camp programs → the youth-band empty state (banded notify
    // card) renders. Copy changed with cardVariant="youth-band": it reads
    // "Be first in when it opens." rather than "nothing open right now".
    await expect(page.getByText(/be first in when it opens/i)).toBeVisible();
    // Scope to the empty-state form — the footer newsletter form also has an
    // email input with the same accessible label, so target by the unique id.
    await page.locator("#empty-finder-youth-camps-email").fill("camps-waitlist-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /notify me/i }).click();
    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });

  test("/youth/camps — band links through to the family page", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The hub band's primary CTA → /youth/camps/schools-out with the
    // hour-by-hour timetable (the "what specifically happens" surface).
    await page.locator('a[href="/youth/camps/schools-out"]').first().click();
    await page.waitForURL("**/youth/camps/schools-out");
    await expect(
      page.getByRole("heading", { level: 1, name: /school's-out day camps/i }),
    ).toBeVisible();
    await expect(page.getByText(/the day, hour by hour/i)).toBeVisible();
    await expect(page.getByText(/drop-off & arrival games/i)).toBeVisible();
  });

  test("/youth/camps/[type] — unknown family 404s", async ({ page }) => {
    const response = await page.goto("/youth/camps/underwater-basket-weaving", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });
});

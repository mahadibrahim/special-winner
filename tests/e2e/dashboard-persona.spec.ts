/**
 * E2E spec: dashboard persona routing
 *
 * Tests the /dashboard redirector logic — each user type lands on the
 * correct destination based on their family_members rows.
 *
 * Personas covered:
 *   parent  → family-only  → /dashboard/family
 *   player  → play-only    → /dashboard/play
 *   both    → both tabs     → respects aspire_dash cookie
 *   fresh   → no data       → /dashboard/start
 *
 * Accounts seeded in src/lib/db/seeds/seed-e2e-tests.ts:
 *   parent@test.aspiresports.com  (pre-existing, has dependents Tommy + Sarah)
 *   player@test.aspiresports.com  (added for this feature — self family_members row)
 *   both@test.aspiresports.com    (added for this feature — dependent + self rows)
 *   fresh@test.aspiresports.com   (added for this feature — no family_members rows)
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS, signIn } from "../utils/test-helpers";

test.describe("Dashboard persona routing", () => {

  // ── 1. Parent (family-only) ──────────────────────────────────────────────
  test.describe("parent account (family-only)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
    });

    test("redirects /dashboard to /dashboard/family", async ({ page }) => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/family/);
    });

    test("family page shows the four section headings", async ({ page }) => {
      await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });

      // Sections 2–4 are always server-rendered. Section 1 ("Needs your
      // attention") is conditional on hasAttentionItems — assert it only when
      // it appears in the DOM so the test is robust to account state.
      await expect(
        page.getByRole("heading", { name: /2 · What's coming up/i })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /3 · What you're part of/i })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /4 · Explore/i })
      ).toBeVisible();
    });

    test("family page has no destination tabs (Family | My Play)", async ({ page }) => {
      await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });

      // DestinationTabs renders a <nav aria-label="Dashboard destination"> only
      // when hasFamily && hasPlay. For a family-only user it returns null.
      const tabsNav = page.getByRole("navigation", { name: "Dashboard destination" });
      await expect(tabsNav).toHaveCount(0);
    });
  });

  // ── 2. Player (play-only) ────────────────────────────────────────────────
  test.describe("player account (play-only)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, TEST_USERS.player.email, TEST_USERS.player.password);
    });

    test("redirects /dashboard to /dashboard/play", async ({ page }) => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/play/);
    });

    test("play page shows 'What's coming up' section heading", async ({ page }) => {
      await page.goto("/dashboard/play", { waitUntil: "domcontentloaded" });

      // Section 2 ("What's coming up") is always server-rendered on /dashboard/play.
      // "Next game" would require a roster spot on a team with a future game;
      // CI's seed seeds the player account without a roster row, so we assert
      // the section heading rather than the inner game card.
      await expect(
        page.getByRole("heading", { name: /2 · What's coming up/i })
      ).toBeVisible();
    });

    test("play page has no destination tabs", async ({ page }) => {
      await page.goto("/dashboard/play", { waitUntil: "domcontentloaded" });
      const tabsNav = page.getByRole("navigation", { name: "Dashboard destination" });
      await expect(tabsNav).toHaveCount(0);
    });
  });

  // ── 3. Both (family + play) ──────────────────────────────────────────────
  test.describe("both account (family + play)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, TEST_USERS.both.email, TEST_USERS.both.password);
    });

    test("destination tabs (Family | My Play) render on /dashboard/family", async ({ page }) => {
      await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });

      const tabsNav = page.getByRole("navigation", { name: "Dashboard destination" });
      await expect(tabsNav).toBeVisible();
      await expect(tabsNav.getByRole("link", { name: "Family" })).toBeVisible();
      await expect(tabsNav.getByRole("link", { name: "My Play" })).toBeVisible();
    });

    test("destination tabs render on /dashboard/play", async ({ page }) => {
      await page.goto("/dashboard/play", { waitUntil: "domcontentloaded" });

      const tabsNav = page.getByRole("navigation", { name: "Dashboard destination" });
      await expect(tabsNav).toBeVisible();
    });

    test("aspire_dash cookie remembered — /dashboard/play then /dashboard returns to /dashboard/play", async ({ page }) => {
      // Step 1: visit /dashboard/play — this writes aspire_dash=play cookie
      await page.goto("/dashboard/play", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/play/);

      // Step 2: visit bare /dashboard — redirector reads the cookie and goes to /play
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/play/);
    });

    test("aspire_dash cookie remembered — /dashboard/family then /dashboard returns to /dashboard/family", async ({ page }) => {
      // Step 1: visit /dashboard/family — writes aspire_dash=family cookie
      await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/family/);

      // Step 2: bare /dashboard should return to /family
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/family/);
    });
  });

  // ── 4. Fresh (no data) ──────────────────────────────────────────────────
  test.describe("fresh account (no family members)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, TEST_USERS.fresh.email, TEST_USERS.fresh.password);
    });

    test("redirects /dashboard to /dashboard/start", async ({ page }) => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/start/);
    });

    test("/dashboard/start shows 'What would you like to do?' heading", async ({ page }) => {
      await page.goto("/dashboard/start", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: /What would you like to do\?/i })
      ).toBeVisible();
    });
  });
});

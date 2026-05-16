import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../utils/test-helpers";

// Phase 2 E2E for the Venue Day route.
//
// Uses the existing e2e seed users:
//   admin-orgb@test.aspiresports.com → location_admin scoped to orgB.
//
// Note: this spec doesn't require seeded activity data to assert the
// shell renders. Block-rendering assertions (color/icon labels) are
// gated on the seed having at least one game/drop-in/rental for the
// current date — they skip when that fixture isn't present.

const LOCATION_ADMIN = {
  email: "admin-orgb@test.aspiresports.com",
  password: "TestAdmin123!",
};

const SUPER_ADMIN = {
  email: "admin@test.aspiresports.com",
  password: "TestAdmin123!",
};

test.describe("Venue Day route", () => {
  test("location_admin lands on today's Venue Day", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("date arrow navigates forward to next day", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);

    const startUrl = new URL(page.url());
    const startDate = startUrl.pathname.split("/").pop()!;

    await page.getByRole("button", { name: /next day/i }).click();

    // The hook uses window.history.pushState; wait for URL to change.
    await page.waitForFunction(
      (start) => window.location.pathname !== `/admin/venue/day/${start}`,
      startDate,
      { timeout: 5_000 },
    );
    const newUrl = new URL(page.url());
    const newDate = newUrl.pathname.split("/").pop()!;
    expect(newDate > startDate).toBe(true);
  });

  test("Today button returns to current day after navigating away", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);

    const originalUrl = page.url();

    await page.getByRole("button", { name: /next day/i }).click();
    await page.waitForFunction(
      (orig) => window.location.href !== orig,
      originalUrl,
      { timeout: 5_000 },
    );

    await page.getByRole("button", { name: /^today$/i }).click();
    await page.waitForFunction(
      (orig) => window.location.href === orig,
      originalUrl,
      { timeout: 5_000 },
    );
  });

  test("activity legend renders all 6 types", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);

    for (const label of ["League", "Tournament", "Drop-in", "Class", "Camp", "Rental"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("tablet viewport: sidebar item labels are hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);

    // Item labels should be hidden at the md breakpoint (icon rail).
    // We use the sidebar element scope to disambiguate from any in-page
    // text that happens to match.
    const venueDayLabel = page.locator("aside").getByText("Venue Day").first();
    await expect(venueDayLabel).toBeHidden();
  });

  test("super_admin can also see /admin/venue (with venue chooser)", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto("/admin/venue");
    // Redirects to /admin/venue/day/<today>; super-admin uses the org's
    // default-first location.
    await page.waitForURL(/\/admin\/venue\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

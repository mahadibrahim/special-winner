import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../utils/test-helpers";

// E2E for the venue area after the command-center migration.
//
// /admin/venue is now the COMMAND CENTER (it used to redirect to the day
// view). The day view still lives at /admin/venue/day/[date]; the tests below
// navigate to it directly rather than relying on the (removed) redirect.
//
// Seed users:
//   admin-orgb@test.aspiresports.com → location_admin scoped to orgB.
//   admin@test.aspiresports.com      → super_admin.

const LOCATION_ADMIN = {
  email: "admin-orgb@test.aspiresports.com",
  password: "TestAdmin123!",
};

const SUPER_ADMIN = {
  email: "admin@test.aspiresports.com",
  password: "TestAdmin123!",
};

// Matches the app's formatStripDate(new Date()) — YYYY-MM-DD in UTC — so the
// day view's "Today" button produces the same value we navigate to here.
const today = () => new Date().toISOString().slice(0, 10);

test.describe("Venue command center + day route", () => {
  // The /api/admin/venue/today aggregation is slow against the accumulated
  // staging DB used in CI (tens of seconds; fast on prod's co-located DB).
  // Assert the server-rendered title immediately (proves the command-center
  // route renders) and give the data-dependent heading a realistic budget.
  test("location_admin sees the command center at /admin/venue", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.goto("/admin/venue");
    await waitForHydration(page);
    await expect(page).toHaveTitle(/command center/i);
    await expect(
      page.getByRole("heading", { name: /needs attention/i }),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("super_admin sees the command center at /admin/venue", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto("/admin/venue");
    await waitForHydration(page);
    await expect(page).toHaveTitle(/command center/i);
    await expect(
      page.getByRole("heading", { name: /needs attention/i }),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("day view renders for a location_admin", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.goto(`/admin/venue/day/${today()}`);
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("date arrow navigates forward to next day", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.goto(`/admin/venue/day/${today()}`);
    await waitForHydration(page);

    const startDate = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByRole("button", { name: /next day/i }).click();

    // The hook uses window.history.pushState; wait for URL to change.
    await page.waitForFunction(
      (start) => window.location.pathname !== `/admin/venue/day/${start}`,
      startDate,
      { timeout: 5_000 },
    );
    const newDate = new URL(page.url()).pathname.split("/").pop()!;
    expect(newDate > startDate).toBe(true);
  });

  test("Today button returns to current day after navigating away", async ({ page }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.goto(`/admin/venue/day/${today()}`);
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
    await page.goto(`/admin/venue/day/${today()}`);
    await waitForHydration(page);

    for (const label of ["League", "Tournament", "Drop-in", "Class", "Camp", "Rental"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("tablet viewport: sidebar item labels are hidden", async ({ page }) => {
    // Tailwind's lg breakpoint is ≥1024px, so 1024 itself lands in the
    // full-width sidebar zone (labels visible). 1023 keeps us in the md
    // icon-rail zone (768–1023) where labels are intentionally hidden.
    await page.setViewportSize({ width: 1023, height: 768 });
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.goto(`/admin/venue/day/${today()}`);
    await waitForHydration(page);

    // Item labels should be hidden at the md breakpoint (icon rail).
    // We use the sidebar element scope to disambiguate from any in-page
    // text that happens to match.
    const venueDayLabel = page.locator("aside").getByText("Venue Day").first();
    await expect(venueDayLabel).toBeHidden();
  });
});

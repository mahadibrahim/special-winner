import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../utils/test-helpers";

// E2E coverage for Phase 1 of the admin overhaul: role-based home
// redirect and cross-role gating in middleware.
//
// Uses the existing e2e seed users:
//   - admin@test.aspiresports.com           → super_admin
//   - admin-orgb@test.aspiresports.com      → location_admin (scoped to orgB)
// See src/lib/db/seeds/seed-e2e-tests.ts for the source.

const SUPER_ADMIN = {
  email: "admin@test.aspiresports.com",
  password: "TestAdmin123!",
};

const LOCATION_ADMIN = {
  email: "admin-orgb@test.aspiresports.com",
  password: "TestAdmin123!",
};

test.describe("admin role routing", () => {
  test("super_admin lands on /admin", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.waitForURL(/\/admin(\/?|\?.*)$/, { timeout: 10_000 });
    await waitForHydration(page);
    // The new home replaces the count grid; sanity-check we're on it.
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("location_admin gets redirected from /admin to /admin/venue", async ({
    page,
  }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    // Phase 2 builds the actual /admin/venue page. For Phase 1 we just
    // confirm the redirect target — accept either a 404 or a successful
    // load at the new URL.
    await page.waitForURL(/\/admin\/venue(\/|$)/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin\/venue(\/|$)/);
  });

  test("location_admin hitting a super-admin-only path is sent to /admin/unauthorized", async ({
    page,
  }) => {
    await signIn(page, LOCATION_ADMIN.email, LOCATION_ADMIN.password);
    await page.waitForURL(/\/admin\/venue(\/|$)/, { timeout: 10_000 });

    // /admin/seasons is super_admin only — middleware should bounce.
    await page.goto("/admin/seasons");
    await expect(page).toHaveURL(/\/admin\/unauthorized/);
    // /admin/unauthorized has no client:load components — skip the
    // hydration beacon wait; the heading assertion below has its own
    // implicit wait.
    await expect(
      page.getByRole("heading", { name: /not your home/i }),
    ).toBeVisible();
  });

  test("super_admin can still access super-admin-only paths", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto("/admin/seasons");
    await waitForHydration(page);
    // Should land on the seasons page, not the unauthorized page.
    await expect(page).toHaveURL(/\/admin\/seasons/);
    await expect(page).not.toHaveURL(/\/admin\/unauthorized/);
  });

  test("/forgot-password redirects through to /signin", async ({ page }) => {
    // /forgot-password is a legacy URL that 301s straight to /signin —
    // the canonical magic-link page after the password-removal migration.
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/signin$/);
    await expect(
      page.getByRole("heading", { name: /^sign in$/i }),
    ).toBeVisible();
  });
});

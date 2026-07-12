import { test, expect } from "@playwright/test";
import { signIn } from "../utils/test-helpers";

/**
 * The standalone check-in dashboard (/admin/check-in, /admin/venue/check-in)
 * was retired in favor of the command center's ActivityDetailPanel — check-in
 * is now a panel inside /admin/venue rather than its own page. The old routes
 * are kept as permanent redirects so bookmarks and stale links still land
 * somewhere useful. See tests/e2e/venue-command-center.spec.ts for coverage
 * of the actual check-in UI (opening an activity roster, walk-in flow, etc.)
 * — this spec only proves the redirect chain still works.
 */
test("legacy check-in routes redirect to the command center", async ({
  page,
}) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");

  await page.goto("/admin/check-in", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/venue$/);

  await page.goto("/admin/venue/check-in", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/venue$/);
});

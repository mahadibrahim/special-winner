import { test, expect } from "@playwright/test";
import { waitForHydration, signIn } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("parent sees the domain radar on the child development page", async ({ page }) => {
  await signIn(page, "parent@test.aspiresports.com", "TestParent123!");
  await page.goto(`${BASE}/dashboard/family`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // Navigate to Tommy's development page explicitly — Tommy is the seeded
  // child with assessments/snapshots; .first() would silently depend on
  // createdAt ordering surviving future fixture additions.
  await page.getByRole("link", { name: "View development for Tommy" }).click();
  await expect(page.locator("svg[data-radar]")).toBeVisible({ timeout: 10_000 });
});

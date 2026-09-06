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

  // Phase 3 S4: the radar is now period-aware. The seed writes Tommy's
  // fixture assessments at seed-run time (recomputePlayerSnapshots(..., new
  // Date())), which lands in the current UTC month/quarter — so the period
  // selector should default to the current quarter's label (e.g. "Q3 2026")
  // rather than a bare "Latest" fallback.
  const periodSelect = page.getByTestId("radar-period-select");
  await expect(periodSelect).toBeVisible();
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const expectedLabel = `Q${quarter} ${now.getUTCFullYear()}`;
  await expect(periodSelect).toHaveValue(new RegExp(`^${now.getUTCFullYear()}-Q${quarter}$`));
  await expect(
    periodSelect.locator("option", { hasText: expectedLabel })
  ).toHaveCount(1);
});

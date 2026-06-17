import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("standings tab shows a live table for an active soccer season @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/summer-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByRole("button", { name: "Standings" }).click();

  const table = page.getByTestId("standings-table");
  await expect(table).toBeVisible();
  const rowCount = await table.locator("tbody tr").count();
  expect(rowCount).toBeGreaterThanOrEqual(2);
});

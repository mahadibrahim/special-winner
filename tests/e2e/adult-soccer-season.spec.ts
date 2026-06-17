import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("adult soccer season page: filter divisions and reach register", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/fall-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // tabs + finder present
  await expect(page.getByRole("heading", { name: /Find your level/i })).toBeVisible();
  const rows = page.getByTestId("division-rows");
  await expect(rows).toBeVisible();

  // filter by Men's narrows the list
  const before = await page.getByTestId("result-count").innerText();
  await page.getByRole("button", { name: "Men's" }).click();
  const after = await page.getByTestId("result-count").innerText();
  expect(Number(after)).toBeLessThanOrEqual(Number(before));

  // a Register link points to the wizard
  const reg = page.getByRole("link", { name: /Register/i }).first();
  await expect(reg).toHaveAttribute("href", /\/register\//);
});

test("landing page points to the current term", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const banner = page.getByTestId("now-registering");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("href", /\/adult\/leagues\/soccer\/fall-2026/);
});

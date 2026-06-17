import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("adult soccer season page: filter divisions and reach register @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/fall-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // tabs + finder present
  await expect(page.getByRole("heading", { name: /Find your level/i })).toBeVisible();
  const rows = page.getByTestId("division-rows");
  await expect(rows).toBeVisible();

  // filter by Men's narrows the list
  const before = await page.getByTestId("result-count").innerText();
  // exact: true — otherwise the substring match also hits the "Women's" chip
  // ("women's" contains "men's"), tripping a strict-mode violation.
  await page.getByRole("button", { name: "Men's", exact: true }).click();
  const after = await page.getByTestId("result-count").innerText();
  expect(Number(after)).toBeLessThanOrEqual(Number(before));

  // a Register link in the finder rows points to the wizard (scope to the
  // rows so we don't match the hero's "Register a team" anchor, which is a
  // same-page scroll link, not a /register/ wizard link)
  const reg = rows.getByRole("link", { name: /Register/i }).first();
  await expect(reg).toHaveAttribute("href", /\/register\//);
});

test("landing page points to the current term @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  // The landing page is server-rendered (the banner is a plain <a>), and its
  // only island (LevelLadder) does not emit a hydration beacon — so we wait on
  // the banner directly rather than on hydration.
  const banner = page.getByTestId("now-registering");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("href", /\/adult\/leagues\/soccer\/fall-2026/);
});

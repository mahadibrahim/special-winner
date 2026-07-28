import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "";

test("flag football landing: hero, tabs, divisions explainer @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/flag-football`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /flag football/i }).first()).toBeVisible();
  await expect(page.getByTestId("landing-tabs")).toBeVisible();
  await expect(page.getByRole("heading", { name: /nobody blocks/i })).toBeVisible();
  const tabs = page.getByTestId("landing-tabs");
  // Scoped to the tabs container: Astro's dev-toolbar X-Ray overlay embeds a
  // hidden <code> dump of each island's serialized props elsewhere in the
  // DOM, and props text (e.g. "Men's 4v4", term labels) duplicates whatever
  // string appears in that JSON — an unscoped getByText hits a strict-mode
  // violation in dev even though the duplicate is never visible.
  await expect(tabs.getByText("Men's 4v4")).toBeVisible();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(tabs.getByText(/Winter 2 2027/)).toBeVisible();
});

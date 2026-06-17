import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("soccer landing tabs switch content @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("landing-tabs")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Why indoor soccer|Real games/i })).toBeVisible();
  await page.getByRole("button", { name: "This Season" }).click();
  await expect(page.getByRole("heading", { name: "This season" })).toBeVisible();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByRole("heading", { name: "Upcoming seasons" })).toBeVisible();
});

test("adult catalog: soccer tile links to the soccer landing @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues`, { waitUntil: "domcontentloaded" });
  const soccerTile = page.getByRole("link", { name: /Soccer/i }).first();
  await expect(soccerTile).toHaveAttribute("href", "/adult/leagues/soccer");
});

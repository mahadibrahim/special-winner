import { test, expect, type Page } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

async function openAdultSoccerSeasonId(page: Page) {
  const res = await page.request.get("/api/public/seasons?sport=soccer&audience=adult");
  const json = await res.json();
  return json.seasons?.[0]?.id as string | undefined;
}

test("division Register lands on canonical /register with choose-mode @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/${id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /how do you want to join/i })).toBeVisible();
  await expect(page.getByText(/Join solo/i)).toBeVisible();
});

test("/register/team/:id redirects to canonical /register/:id @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/team/${id}`, { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain(`/register/${id}`);
  expect(page.url()).not.toContain("/team/");
});

test("solo path advances past choose-mode into the wizard @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/${id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await page.getByText(/Join solo/i).click();
  // After picking solo, the choose-mode heading is gone and the wizard renders.
  await expect(page.getByRole("heading", { name: /how do you want to join/i })).toHaveCount(0);
});

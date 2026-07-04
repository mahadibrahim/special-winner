import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("careers application submits and shows the success card", async ({ page }) => {
  await page.goto(`${BASE}/careers`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.selectOption("#role", "referee");
  await page.fill("#firstName", "Playwright");
  await page.fill("#lastName", "Applicant");
  await page.fill("#email", `e2e-careers-${Date.now()}@example.com`);
  await page.fill("#experience", "Officiated intramurals for two years.");
  await page.getByRole("button", { name: /submit application/i }).click();

  await expect(page.getByText("Application received.")).toBeVisible({ timeout: 10_000 });
});

test("careers form surfaces validation errors without submitting", async ({ page }) => {
  await page.goto(`${BASE}/careers`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByRole("button", { name: /submit application/i }).click();
  await expect(page.getByText(/please pick a role/i)).toBeVisible();
});

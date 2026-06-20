import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

test("create and publish a camp via the wizard, then see it in the seasons list", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/admin/seasons", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Open the offering wizard dialog.
  // The button auto-populates location/sport from programs[0] — no select interaction needed.
  await page.getByRole("button", { name: /new offering/i }).click();

  // Step 1: select the Camp type card (aria-pressed button)
  await page.getByRole("button", { name: /camp/i, pressed: false }).first().click();

  // Advance to step 2 (Details)
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 2: fill camp details
  const campName = `E2E Summer Camp ${Date.now()}`;
  await page.getByLabel("Name *").fill(campName);
  await page.getByLabel("Start date *").fill("2026-07-06");
  await page.getByLabel("End date *").fill("2026-07-10");
  await page.getByLabel("Full-day price ($) *").fill("375");
  await page.getByLabel("Youngest age *").fill("5");
  await page.getByLabel("Oldest age *").fill("12");

  // Advance to step 3 (Review)
  await page.getByRole("button", { name: /^review$/i }).click();

  // Step 3: publish
  await page.getByRole("button", { name: /publish now/i }).click();

  // After publish, dialog closes and fetchData() fires — the new offering row should appear
  await expect(page.getByText(campName)).toBeVisible({ timeout: 10_000 });
});

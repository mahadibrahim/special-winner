/**
 * Referee rating flow — public single-use feedback link.
 *
 * Fixture: `e2e-feedback-referee-open` seeded by
 * `seedFeedbackFixtures()` in `src/lib/db/seeds/seed-e2e-tests.ts`
 * (a completed game + gameOfficials row for coach@test.aspiresports.com,
 * rated "Coach T."). The token is single-use — re-seed
 * (`npm run db:seed:e2e`) before re-running this spec.
 */
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const TOKEN = "e2e-feedback-referee-open";

test("referee rating: all dimensions + submit", async ({ page }) => {
  await page.goto(`/feedback/${TOKEN}`);
  await waitForHydration(page);

  await expect(page.getByText(/rate coach t\./i)).toBeVisible();

  await page.getByTestId("overall-star-4").click();
  await page.getByTestId("gameControl-star-5").click();
  await page.getByTestId("communication-star-4").click();
  await page.getByTestId("fairness-star-3").click();
  await page.getByTestId("referee-comment").fill("Kept things safe");
  await page.getByTestId("referee-submit").click();

  await expect(page.getByText("Thank you!")).toBeVisible();

  // Single-use.
  await page.goto(`/feedback/${TOKEN}`);
  await waitForHydration(page);
  await expect(page.getByText(/already shared/i)).toBeVisible();
});

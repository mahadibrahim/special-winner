/**
 * E2E spec: NPS feedback flow (promoter path)
 *
 * Drives the public /feedback/[token] page — no auth required. Fixed token
 * seeded by seedFeedbackFixtures() in src/lib/db/seeds/seed-e2e-tests.ts:
 *   e2e-feedback-nps-open  (nps_drop_in, status='sent', org has an
 *                           Aspire Google review URL so the promoter CTA renders)
 *
 * This spec CONSUMES the token (score submission flips status to
 * 'responded'), so re-run `npm run db:seed:e2e` between spec runs.
 */

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const TOKEN = "e2e-feedback-nps-open";

test.describe("NPS feedback flow", () => {
  test("promoter path: score 10 → Google review CTA", async ({ page }) => {
    await page.goto(`/feedback/${TOKEN}`);
    await waitForHydration(page);

    await expect(page.getByText("How was it?")).toBeVisible();
    await page.getByTestId("score-10").click();

    const cta = page.getByTestId("review-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "https://example.com/e2e-review");

    await page.getByTestId("finish-button").click();
    await expect(page.getByText("Thank you!")).toBeVisible();

    // Single-use: revisiting shows the responded card.
    await page.goto(`/feedback/${TOKEN}`);
    await waitForHydration(page);
    await expect(page.getByText(/already shared/i)).toBeVisible();
  });

  test("unknown token shows the invalid-link card", async ({ page }) => {
    await page.goto("/feedback/definitely-not-a-real-token");
    await waitForHydration(page);
    await expect(page.getByText(/isn't valid/i)).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../tests/utils/test-helpers";
import { TRAINING_USERS } from "../../src/lib/db/seeds/seed-e2e-tests";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-referee — captures the "Using the system" product-tour screenshots
 * for the referee deck (see PRODUCT_TOUR["role.ref"] in
 * src/lib/ops-catalog/views/training-deck.ts). Distinct from
 * referee-gameday.walkthrough.ts, which feeds the "Watch the walkthroughs"
 * narration video — this feeds still screenshots for the deck's own visual
 * tour chapter. Same fixture match and account as that file; screens
 * legitimately overlap.
 *
 * "Submit report" is a real write (POST /api/referee/matches/[gameId]/report)
 * — safe to repeat because seed-e2e-tests.ts resets the training match to
 * unreported on every `db:seed:e2e` run, exactly as referee-gameday.walkthrough.ts
 * documents.
 */
const WORKFLOW = "tour-referee";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "ref" });

  await signIn(
    page,
    TRAINING_USERS.referee.email,
    TRAINING_USERS.referee.password,
  );

  await tour.step(
    page,
    "My matches",
    async () => {
      await page.goto("/referee", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "my-matches" },
  );

  const matchLink = page.locator('a[href^="/referee/matches/"]').first();
  await expect(matchLink).toBeVisible({ timeout: 15_000 });

  await tour.step(
    page,
    "Match detail",
    async () => {
      await matchLink.click();
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "match-detail" },
  );

  await tour.step(
    page,
    "Enter the score",
    async () => {
      await page.getByLabel("Home score").fill("3");
      await page.getByLabel("Away score").fill("1");
    },
    { tourSlug: "enter-score" },
  );

  await tour.step(
    page,
    "Log an incident",
    async () => {
      await page.getByRole("button", { name: /add/i }).click();
      await page.locator("select").first().selectOption("red_card");
      const minuteInput = page.getByPlaceholder("min").first();
      if ((await minuteInput.count()) > 0) {
        await minuteInput.fill("62");
      }
      const descriptionInput = page.getByPlaceholder("Notes").first();
      if ((await descriptionInput.count()) > 0) {
        await descriptionInput.fill(
          "Second yellow — sent off, coach notified in person.",
        );
      }
    },
    { tourSlug: "log-incident" },
  );

  await tour.step(
    page,
    "Submit the report",
    async () => {
      await page.getByRole("button", { name: /submit report/i }).click();
      await expect(page.getByText("Saved.")).toBeVisible({ timeout: 10_000 });
    },
    { tourSlug: "submit-report" },
  );

  await tour.finish();
});

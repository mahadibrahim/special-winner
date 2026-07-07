import { test } from "@playwright/test";
import {
  signInAsAdmin,
  waitForHydration,
} from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-director — captures the "Using the system" product-tour screenshots
 * for the director deck (see PRODUCT_TOUR["role.director"] in
 * src/lib/ops-catalog/views/training-deck.ts): applications, coach
 * credentials, curriculum, and assessment coverage. Distinct from
 * admin-hire-compliance.walkthrough.ts / admin-sequencing.walkthrough.ts,
 * which feed narration videos for two specific workflows — this is a
 * broader still-screenshot tour across the director's real day-to-day
 * screens, some of which those two workflows don't visit at all
 * (curriculum, assessment coverage).
 */
const WORKFLOW = "tour-director";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "director" });

  await signInAsAdmin(page);

  await tour.step(
    page,
    "Applications",
    async () => {
      await page.goto("/admin/applications", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "applications" },
  );

  await tour.step(
    page,
    "Coach credentials grid",
    async () => {
      await page.goto("/admin/coaches", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      // CoachCredentialsGrid fetches against a shared staging org with
      // dozens of coach-role fixtures — a real fetch here can take several
      // seconds (see admin-hire-compliance.walkthrough.ts's own comment on
      // this exact grid), longer than waitForContentReady's default
      // timeout allows for.
      await waitForContentReady(page, 20_000);
    },
    { tourSlug: "coaches-credentials" },
  );

  await tour.step(
    page,
    "Curriculum oversight",
    async () => {
      await page.goto("/admin/curriculum", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "curriculum" },
  );

  await tour.step(
    page,
    "Assessment coverage report",
    async () => {
      await page.goto("/admin/curriculum/assessment-coverage", {
        waitUntil: "domcontentloaded",
      });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "assessment-coverage" },
  );

  await tour.finish();
});

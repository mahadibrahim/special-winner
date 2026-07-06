import { test } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * coach-practices — the practice-session list (including the sequence
 * progress bar the admin-sequencing walkthrough's attach step feeds), and a
 * single session's detail/reflection UI.
 *
 * Read-mostly: opens "Mark Complete"/reflection but does not submit it —
 * completing a session is a one-way state transition (not idempotent), and
 * the session this walkthrough opens is the same draft admin-sequencing's
 * attach step generates, so completing it here would make later re-runs of
 * both walkthroughs show a stale "already completed" state instead of a
 * fresh demo. No deckSlug: practice planning isn't an ops-catalog activity.
 */
const WORKFLOW = "coach-practices";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "coach" });

  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

  await tour.step(page, "Practice sessions — list and sequence progress", async () => {
    await page.goto("/coach/practices", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const sessionLink = page.locator('a[href^="/coach/practices/"]').first();
  if ((await sessionLink.count()) > 0) {
    await tour.step(page, "Open a practice session", async () => {
      await sessionLink.click();
      await waitForHydration(page);
    });

    const reflectionButton = page.getByRole("button", { name: /reflection/i }).first();
    if ((await reflectionButton.count()) > 0) {
      await tour.step(page, "Open the post-session reflection form (not saved)", async () => {
        await reflectionButton.click();
      });
    }
  }

  await tour.finish();
});

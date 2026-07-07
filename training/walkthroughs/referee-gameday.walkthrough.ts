import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../tests/utils/test-helpers";
import { TRAINING_USERS } from "../../src/lib/db/seeds/seed-e2e-tests";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * referee-gameday — a referee's assignment list and final score reporting.
 *
 * Scouting note: the referee portal has no dedicated "check-in" control
 * today — /referee is a read-only list of assigned matches (see
 * src/components/referee/referee-matches.tsx). act.ref_check_in's SOP
 * describes a physical sign-in at the event lead's station, which isn't
 * modeled in the app yet; this walkthrough uses the assignment list as the
 * closest available illustration and tags it with that slug as an
 * approximation, flagged here rather than silently invented. "Submit
 * report" is an exact match for act.score_reporting_final and is a real
 * write — POST /api/referee/matches/[gameId]/report updates the game row
 * in place and replaces its incidents, so re-running this walkthrough is
 * safe (seed-e2e-tests.ts also resets the training match to unreported on
 * every `db:seed:e2e` run, so the "before" screen is always fresh).
 *
 * act.ejection_logging (accountable role.ref) is a genuine, exact match too
 * — its own SOP says an ejection is logged as an incident on this same
 * match report, type "Red card" being "the closest match to an ejection in
 * today's incident types" (see the activity's sop_body). So the incident
 * add step below is split in two: add an incident and set its type to
 * "red_card" (tagged ejection_logging), then fill the score/submit
 * (unchanged, tagged score_reporting_final) — same UI, two honestly
 * distinct catalog activities.
 */
const WORKFLOW = "referee-gameday";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "ref" });

  await signIn(page, TRAINING_USERS.referee.email, TRAINING_USERS.referee.password);

  await tour.step(
    page,
    "My matches — the referee's assignment list",
    async () => {
      await page.goto("/referee", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    },
    { deckSlug: "ref_check_in" },
  );

  const matchLink = page.locator('a[href^="/referee/matches/"]').first();
  await expect(matchLink).toBeVisible({ timeout: 15_000 });

  await tour.step(page, "Open the training fixture match", async () => {
    await matchLink.click();
    await waitForHydration(page);
  });

  await tour.step(page, "Enter the final score", async () => {
    await page.getByLabel("Home score").fill("3");
    await page.getByLabel("Away score").fill("1");
  });

  await tour.step(
    page,
    "Log an ejection as a red-card incident",
    async () => {
      await page.getByRole("button", { name: /add/i }).click();
      await page.locator("select").first().selectOption("red_card");
      const minuteInput = page.getByPlaceholder("min").first();
      if ((await minuteInput.count()) > 0) {
        await minuteInput.fill("62");
      }
      const descriptionInput = page.getByPlaceholder("Notes").first();
      if ((await descriptionInput.count()) > 0) {
        await descriptionInput.fill("Second yellow — sent off, coach notified in person.");
      }
    },
    { deckSlug: "ejection_logging" },
  );

  await tour.step(
    page,
    "Submit the match report",
    async () => {
      await page.getByRole("button", { name: /submit report/i }).click();
      await expect(page.getByText("Saved.")).toBeVisible({ timeout: 10_000 });
    },
    { deckSlug: "score_reporting_final" },
  );

  await tour.finish();
});

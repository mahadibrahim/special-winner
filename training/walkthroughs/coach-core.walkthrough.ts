import { test } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * coach-core — roster review, attendance, and opening a player assessment.
 *
 * Read-mostly by design (see the Phase 2 plan's Design Decision 1): the
 * attendance-toggle, roster-note, and assessment steps open/interact with
 * their UI but stop short of clicking Save/Submit, so this walkthrough
 * never writes attendance records, roster notes, or assessment levels. That
 * specifically protects the curriculum-radar e2e fixture (Tommy assessed at
 * fixed levels 4/3/2/3 in seed-e2e-tests.ts's seedCurriculumRadarFixture) —
 * an accidental re-assessment here would silently break that spec.
 *
 * No step is tagged with a deckSlug: none of docs/operations/catalog's 63
 * activities cover coach roster/attendance/assessment UI (see the plan's
 * Scouting Finding 1).
 */
const WORKFLOW = "coach-core";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "coach" });

  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  await waitForHydration(page);

  await tour.step(page, "Coach dashboard — today at a glance", async () => {
    await page.goto("/coach", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  await tour.step(page, "My teams", async () => {
    await page.goto("/coach/teams", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const rosterLink = page.locator('a[href^="/coach/roster/"]').first();
  if ((await rosterLink.count()) > 0) {
    await tour.step(page, "Open a team roster", async () => {
      await rosterLink.click();
      await waitForHydration(page);
    });

    const teamId = new URL(page.url()).pathname.split("/").pop()!;

    const addNoteButton = page.getByTitle("Add note").first();
    if ((await addNoteButton.count()) > 0) {
      await tour.step(page, "Open the add-note UI for a player (not submitted)", async () => {
        await addNoteButton.click();
      });
    }

    await tour.step(page, "Open the attendance tracker", async () => {
      await page.goto(`/coach/attendance/${teamId}`, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    });

    const presentButton = page.getByTitle("Present").first();
    if ((await presentButton.count()) > 0) {
      await tour.step(page, "Mark a player present (not saved)", async () => {
        await presentButton.click();
      });
    }
  }

  await tour.step(page, "Player assessments overview", async () => {
    await page.goto("/coach/assessments", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const playerHeading = page.getByRole("heading", { level: 3 }).first();
  if ((await playerHeading.count()) > 0) {
    await tour.step(page, "Open a player's assessment detail", async () => {
      await playerHeading.click();
      await waitForHydration(page);
    });

    const recordButton = page.getByRole("button", { name: /assessment/i }).first();
    if ((await recordButton.count()) > 0) {
      await tour.step(page, "Open the record-assessment form (not submitted)", async () => {
        await recordButton.click();
      });
    }
  }

  await tour.finish();
});

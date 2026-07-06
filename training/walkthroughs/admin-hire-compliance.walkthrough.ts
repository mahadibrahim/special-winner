import { test, expect } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { TRAINING_USERS } from "../../src/lib/db/seeds/seed-e2e-tests";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * admin-hire-compliance — the hiring pipeline fallback view and the coach
 * credential compliance grid.
 *
 * "Mark hired" and the credential edit are both real writes:
 *  - Mark hired targets training+applicant@test.aspiresports.com, which
 *    seed-e2e-tests.ts resets to un-hired on every `npm run db:seed:e2e`
 *    run (the hire endpoint 409s once already hired — re-run the seed
 *    before re-running this walkthrough for the full "click Mark hired"
 *    beat). On a re-run WITHOUT a re-seed the applicant row renders a
 *    "Hired" badge instead of the button (applications-list.tsx branches
 *    on status === "hired"), so the step below degrades to capturing that
 *    already-hired state — `npm run training:videos` must stay green on
 *    repeat runs without a DB reset (Design Decision 1, Task 14 Step 5).
 *  - The credential edit targets training+coach@…, never
 *    coach@test.aspiresports.com, and is naturally idempotent — POST
 *    /api/admin/coaches/credentials upserts one row per (user, org, type).
 * No ops-catalog activity covers hiring/credentials (coach-lifecycle
 * features, not modeled in the catalog) — no deckSlug tags. `role:
 * "director"` below is inert as a result (see Design Decision 2).
 */
const WORKFLOW = "admin-hire-compliance";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "director" });

  await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

  await tour.step(page, "Applications — hiring pipeline fallback view", async () => {
    await page.goto("/admin/applications", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const applicantRow = page.locator("tr", { hasText: TRAINING_USERS.applicant.email });
  await expect(applicantRow).toBeVisible({ timeout: 15_000 });

  const markHiredButton = applicantRow.getByRole("button", { name: /mark hired/i });
  if ((await markHiredButton.count()) > 0) {
    await tour.step(page, "Mark the training applicant hired", async () => {
      await markHiredButton.click();
      await expect(applicantRow.getByText(/hired/i)).toBeVisible({ timeout: 10_000 });
    });
  } else {
    // Already hired (re-run without a re-seed) — capture the hired state.
    await tour.step(page, "The training applicant shows as hired", async () => {
      await expect(applicantRow.getByText(/hired/i)).toBeVisible({ timeout: 10_000 });
    });
  }

  await tour.step(page, "Coach compliance grid", async () => {
    await page.goto("/admin/coaches", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const trainingCoachRow = page.locator("tr", { hasText: TRAINING_USERS.coach.email });
  // CoachCredentialsGrid fetches /api/admin/coaches/credentials in a
  // useEffect and renders a LoadingSkeleton until it resolves —
  // waitForHydration only confirms React mounted, not that the fetch has
  // completed. Give the row time to actually appear (a real fetch against a
  // shared staging org with dozens of coach-role fixtures can take a few
  // seconds) before falling back to "not found" — an immediate count()
  // check here raced the fetch and always read 0, discovered during Task 9
  // verification.
  await trainingCoachRow.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if ((await trainingCoachRow.count()) > 0) {
    await tour.step(page, "Open the SafeSport credential editor", async () => {
      await trainingCoachRow.getByRole("button").first().click();
    });

    await tour.step(page, "Record the credential as verified", async () => {
      await page.locator("#cred-status").click();
      await page.getByRole("option", { name: /valid \(verified\)/i }).click();
      await page.getByLabel("Issued").fill(new Date().toISOString().slice(0, 10));
      await page.getByRole("button", { name: /^save$/i }).click();
    });
  }

  await tour.finish();
});

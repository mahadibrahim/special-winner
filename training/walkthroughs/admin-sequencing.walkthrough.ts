import { test, expect } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * admin-sequencing — open the curriculum sequence library, inspect the
 * training fixture sequence, and attach it to the seeded e2e season.
 * Attaching is safe to repeat: POST
 * /api/admin/curriculum/sequences/[id]/attach is idempotent by design
 * (skips already-created draft session_plans — confirmed both in that
 * endpoint's own doc comment and in sequence-editor.tsx's on-screen copy,
 * "Re-attaching is safe — existing drafts are skipped."). No ops-catalog
 * activity covers curriculum sequencing — no deckSlug tags; `role:
 * "director"` is inert as a result (see Design Decision 2).
 *
 * Deviation from the plan's literal script: the plan asserted success via
 * `page.getByText(/attached/i)`, expecting sequence-editor.tsx's
 * `toast.success("Attached — N draft plans generated")` to render. It
 * never does — confirmed by investigation during Task 10 that no page
 * under the Aspire chrome (src/layouts/BaseLayout.astro) mounts sonner's
 * <Toaster />; only 5 standalone SoccerOne marketing pages do their own
 * local mount. Every toast.success/toast.error call in every admin/coach
 * component (58 files import from "sonner") is a silent no-op today. That
 * is a real, pre-existing, app-wide bug — flagged for the controller's
 * sweep rather than fixed here, since mounting a global <Toaster /> in
 * BaseLayout is a shared-infrastructure change out of this task's scope.
 * This walkthrough instead asserts on the attach API's own response
 * (still a real, honest signal that the write succeeded) rather than a
 * UI affordance that cannot currently appear.
 */
const WORKFLOW = "admin-sequencing";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "director" });

  await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

  await tour.step(page, "Curriculum sequence library", async () => {
    await page.goto("/admin/curriculum/sequences", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const trainingSequenceCard = page.locator('[data-testid="sequence-card"]', {
    hasText: "Training Fixture Sequence",
  });
  await expect(trainingSequenceCard).toBeVisible({ timeout: 15_000 });

  await tour.step(page, "Open the training fixture sequence", async () => {
    await trainingSequenceCard.click();
  });

  const attachSection = page.locator("section", { hasText: "Attach to a season" });
  await expect(attachSection).toBeVisible({ timeout: 10_000 });

  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await tour.step(page, "Choose the season and generate practice-plan drafts", async () => {
    await attachSection.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /E2E Test Spring 2026/i }).click();
    await attachSection.getByLabel("First practice date").fill(startDate);
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/attach") && res.request().method() === "POST",
        { timeout: 15_000 },
      ),
      attachSection.getByRole("button", { name: /attach & generate/i }).click(),
    ]);
    expect(response.ok()).toBe(true);
  });

  await tour.finish();
});

import { test } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * venue-manager — the venue command center's event-day overview, the
 * check-in station, and end-of-day reports.
 *
 * act.team_check_in is the closest catalog match for the check-in page and
 * is tagged accordingly. The command-center tour itself has no catalog
 * counterpart (it's a cross-activity dashboard, not a single tracked
 * activity) so its steps are untagged.
 *
 * The tour `role` is "event_lead", NOT "venue_manager", deliberately: the
 * Phase 1 deck generator (src/lib/ops-catalog/views/training-deck.ts)
 * places each activity's screenshot slot only in the deck of the role the
 * catalog holds accountable — act.team_check_in's slot is
 * training/screenshots/event_lead/team_check_in.png inside
 * role.event_lead.deck.html. role.venue_manager.deck.html has no
 * team_check_in slot at all (venue_manager is merely "informed" on that
 * activity), so copying the screenshot to a venue_manager/ directory would
 * never be picked up by `catalog:render --embed`. Discovered during Task 14
 * end-to-end verification; the plan's original venue_manager expectation
 * was wrong against the real deck output. `role` only affects the
 * deck-slot copy path (Design Decision 2) — the workflow name, sign-in,
 * and pages toured are unchanged.
 */
const WORKFLOW = "venue-manager";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "event_lead" });

  await signInAsAdmin(page);

  await tour.step(page, "Venue command center — today's overview", async () => {
    await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const activityBlock = page.locator("[data-activity-block]").first();
  if ((await activityBlock.count()) > 0) {
    await tour.step(page, "Open an activity's roster panel", async () => {
      await activityBlock.click();
    });
  }

  await tour.step(
    page,
    "Player/team check-in station",
    async () => {
      await page.goto("/admin/venue/check-in", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    },
    { deckSlug: "team_check_in" },
  );

  await tour.step(page, "End-of-day reports", async () => {
    await page.goto("/admin/venue/reports", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  await tour.finish();
});

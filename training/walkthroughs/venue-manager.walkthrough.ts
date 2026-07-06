import { test } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * venue-manager — the venue command center's event-day overview, the
 * check-in station, and end-of-day reports.
 *
 * act.team_check_in (role.venue_manager is "informed" on its escalation
 * path, and it's already the venue_manager tools entry in
 * src/lib/ops-catalog/views/training-deck.ts's PORTAL_PAGES for
 * /admin/venue/check-in) is the closest catalog match for the check-in
 * page and is tagged accordingly. The command-center tour itself has no
 * catalog counterpart (it's a cross-activity dashboard, not a single
 * tracked activity) so its steps are untagged.
 */
const WORKFLOW = "venue-manager";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "venue_manager" });

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

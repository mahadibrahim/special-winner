import { test } from "@playwright/test";
import {
  signInAsAdmin,
  waitForHydration,
} from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-venue — captures the "Using the system" product-tour screenshot for
 * BOTH the venue_manager and event_lead decks. Both roles run the exact same
 * venue command center day-of (see PRODUCT_TOUR["role.venue_manager"], which
 * role.event_lead's own entry aliases in
 * src/lib/ops-catalog/views/training-deck.ts) — so the step below tags BOTH
 * `tourRole`s via two `tour.step()` calls sharing one navigation (the
 * screenshot content is identical either way; only the copy destination
 * differs). This mirrors venue-manager.walkthrough.ts's own `deckRole`
 * override pattern for the same reason: one screen, more than one role's
 * deck needs the slot.
 *
 * Used to have separate "Check-in station" and "Walk-up registration" tour
 * steps navigating to /admin/venue/check-in and /admin/venue/walk-up. Those
 * pages no longer exist — both flows are reached from this same
 * command-center board's roster panel — and 38cb532d made both routes
 * 308-redirect back here, so the steps were dropped rather than left
 * capturing two duplicate screenshots of this same board under stale
 * captions. A follow-up could add real roster-panel / walk-in-flow tour
 * steps (see venue-manager.walkthrough.ts's roster-panel and walk-in steps
 * for the interaction pattern) if per-flow tour slides are wanted again.
 *
 * Distinct from venue-manager.walkthrough.ts, which feeds the "Watch the
 * walkthroughs" narration video for role.event_lead only — this feeds still
 * screenshots for both decks' own visual tour chapters.
 */
const WORKFLOW = "tour-venue";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "venue_manager" });

  await signInAsAdmin(page);

  await tour.step(
    page,
    "Venue command center",
    async () => {
      await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "command-center" },
  );
  await tour.step(
    page,
    "Venue command center (event_lead copy)",
    async () => {},
    {
      tourSlug: "command-center",
      tourRole: "event_lead",
      pauseMs: 0,
    },
  );

  await tour.finish();
});

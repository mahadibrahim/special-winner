import { test } from "@playwright/test";
import {
  signInAsAdmin,
  waitForHydration,
} from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-venue — captures the "Using the system" product-tour screenshots for
 * BOTH the venue_manager and event_lead decks. Both roles run the exact same
 * command-center/check-in/walk-up screens day-of (see
 * PRODUCT_TOUR["role.venue_manager"], which role.event_lead's own entry
 * aliases in src/lib/ops-catalog/views/training-deck.ts) — so every step
 * below tags BOTH `tourRole`s via two `tour.step()` calls sharing one
 * navigation (the screenshot content is identical either way; only the
 * copy destination differs). This mirrors venue-manager.walkthrough.ts's
 * own `deckRole` override pattern for the same reason: one screen, more
 * than one role's deck needs the slot.
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

  await tour.step(
    page,
    "Check-in station",
    async () => {
      await page.goto("/admin/venue/check-in", {
        waitUntil: "domcontentloaded",
      });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "check-in" },
  );
  await tour.step(page, "Check-in station (event_lead copy)", async () => {}, {
    tourSlug: "check-in",
    tourRole: "event_lead",
    pauseMs: 0,
  });

  await tour.step(
    page,
    "Walk-up registration",
    async () => {
      await page.goto("/admin/venue/walk-up", {
        waitUntil: "domcontentloaded",
      });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "walk-up" },
  );
  await tour.step(
    page,
    "Walk-up registration (event_lead copy)",
    async () => {},
    {
      tourSlug: "walk-up",
      tourRole: "event_lead",
      pauseMs: 0,
    },
  );

  await tour.finish();
});

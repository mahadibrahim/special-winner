import { test } from "@playwright/test";
import {
  signIn,
  waitForHydration,
  TEST_USERS,
} from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-coach — captures the "Using the system" product-tour screenshots for
 * the coach deck (see PRODUCT_TOUR["role.coach"] in
 * src/lib/ops-catalog/views/training-deck.ts). Distinct from coach-core.walkthrough.ts
 * and coach-practices.walkthrough.ts: those feed narration videos for the
 * "Watch the walkthroughs" appendix slide; this feeds still screenshots for
 * the deck's own visual how-to chapter. The two pipelines share the same
 * account and, in several places, the same screen — that overlap is
 * expected, not a sign one should be deleted.
 *
 * Read-mostly, same rationale as coach-core.walkthrough.ts: interactive
 * steps (attendance toggle, assessment form) open the UI but never click
 * Save/Submit, so this never mutates attendance records, roster notes, or
 * assessment levels — protecting the curriculum-radar e2e fixture the same
 * way coach-core.walkthrough.ts's own comment documents.
 */
const WORKFLOW = "tour-coach";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "coach" });

  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  await waitForHydration(page);
  await waitForContentReady(page);

  await tour.step(
    page,
    "Coach dashboard",
    async () => {
      await page.goto("/coach", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "dashboard" },
  );

  await tour.step(
    page,
    "My teams",
    async () => {
      await page.goto("/coach/teams", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "teams" },
  );

  const rosterLink = page.locator('a[href^="/coach/roster/"]').first();
  await rosterLink
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  let teamId: string | null = null;
  if ((await rosterLink.count()) > 0) {
    await tour.step(
      page,
      "Team roster",
      async () => {
        await rosterLink.click();
        await waitForHydration(page);
        await waitForContentReady(page);
      },
      { tourSlug: "roster" },
    );
    teamId = new URL(page.url()).pathname.split("/").pop()!;

    await tour.step(
      page,
      "Attendance tracker",
      async () => {
        await page.goto(`/coach/attendance/${teamId}`, {
          waitUntil: "domcontentloaded",
        });
        await waitForHydration(page);
        await waitForContentReady(page);
      },
      { tourSlug: "attendance" },
    );
  }

  await page.goto("/coach/assessments", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await waitForContentReady(page);
  const playerHeading = page.getByRole("heading", { level: 3 }).first();
  await playerHeading
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  if ((await playerHeading.count()) > 0) {
    await tour.step(
      page,
      "Open a player's assessment detail",
      async () => {
        await playerHeading.click();
        await waitForHydration(page);
        await waitForContentReady(page);
      },
      { tourSlug: "assess-player" },
    );
  }

  await tour.step(
    page,
    "Practice sessions",
    async () => {
      await page.goto("/coach/practices", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "practices" },
  );

  await tour.step(
    page,
    "Coaching resources",
    async () => {
      await page.goto("/coach/resources", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "resources" },
  );

  await tour.step(
    page,
    "Message parents",
    async () => {
      await page.goto("/coach/messages", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "messages" },
  );

  await tour.finish();
});

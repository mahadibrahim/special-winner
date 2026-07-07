import { test } from "@playwright/test";
import { signIn, waitForHydration } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";
import { waitForContentReady } from "../lib/wait-for-content";

/**
 * tour-photographer — captures the "Using the system" product-tour
 * screenshots for the photographer deck (see
 * PRODUCT_TOUR["role.photographer"] in
 * src/lib/ops-catalog/views/training-deck.ts).
 *
 * Deviation from the plan's literal "/admin/media shoots" framing: verified
 * against src/middleware.ts, `/admin/media` is the super-admin MANAGEMENT
 * UI for the media program, not what a photographer signs into — the
 * middleware's own comment says so explicitly ("media_staff/media_editor
 * users access the customer-facing /media surface, not /admin/media").
 * role.photographer's real login is one of the two media auth roles
 * (media_staff or media_editor; there is no separate "photographer" auth
 * role in the app), and PORTAL_PAGES["role.photographer"] already points at
 * /media/**, not /admin/media/**. This tour follows that verified reality:
 * media_staff for the assigned-jobs side (shoots), media_editor for the
 * tagging side — together covering "shoots + tag/publish" the way the plan
 * described the flow, just via the actual accessible routes rather than the
 * admin-only management screens.
 *
 * seed-e2e-tests.ts's "tagger fixture" sessions are assigned to
 * media_staff@test.aspiresports.com and give both /media/jobs and
 * /media/queue real, non-empty content to screenshot.
 */
const WORKFLOW = "tour-photographer";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "photographer" });

  await signIn(page, "media_staff@test.aspiresports.com", "TestMedia123!");

  await tour.step(
    page,
    "My jobs",
    async () => {
      await page.goto("/media/jobs", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
      // JobsList (src/components/media/jobs-list.tsx) renders NOTHING while
      // its fetch is in flight — no spinner, no aria-busy, just an empty
      // fragment until setState runs — so waitForContentReady's generic
      // spinner/aria-busy check can't detect "still loading" here at all.
      // Wait directly for a section heading ("Needs confirmation" /
      // "Today" / "Upcoming" / "Past") instead; fail-soft since a
      // genuinely job-free account is a real, valid state too.
      await page
        .getByRole("heading", { level: 2 })
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {});
    },
    { tourSlug: "my-jobs" },
  );

  const jobLink = page.locator('a[href^="/media/jobs/"]').first();
  await jobLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if ((await jobLink.count()) > 0) {
    await tour.step(
      page,
      "Job detail",
      async () => {
        await jobLink.click();
        await waitForHydration(page);
        await waitForContentReady(page);
        // JobDetail (src/components/media/job-detail.tsx) renders a plain
        // "Loading…" TEXT NODE while fetching — no spinner class, no
        // aria-busy — so wait directly for the loaded state's own <h1>.
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: 8_000 })
          .catch(() => {});
      },
      { tourSlug: "job-detail" },
    );
  }

  await signIn(page, "media_editor@test.aspiresports.com", "TestMedia123!");

  await tour.step(
    page,
    "Tagging queue",
    async () => {
      await page.goto("/media/queue", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await waitForContentReady(page);
    },
    { tourSlug: "tagging-queue" },
  );

  const sessionLink = page.locator('a[href^="/media/tag/"]').first();
  await sessionLink
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  if ((await sessionLink.count()) > 0) {
    await tour.step(
      page,
      "Tag a session",
      async () => {
        await sessionLink.click();
        await waitForHydration(page);
        await waitForContentReady(page);
      },
      { tourSlug: "tag-session" },
    );
  }

  await tour.finish();
});

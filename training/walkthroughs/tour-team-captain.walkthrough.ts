import { test, expect } from "@playwright/test";
import { createTour, registerVideoCapture } from "../lib/tour";
import { E2E_TEAM_REG_TOKEN_ORG_A } from "../../src/lib/db/seeds/seed-e2e-tests";

/**
 * tour-team-captain — captures the "Using the system" product-tour
 * screenshot for the team_captain deck (see
 * PRODUCT_TOUR["role.team_captain"] in
 * src/lib/ops-catalog/views/training-deck.ts).
 *
 * Verified finding, worth flagging explicitly: /team/[token] (see
 * src/pages/team/[token].astro) is NOT a login-gated captain console — it's
 * a public, token-only invite/recruiting landing page. There is no
 * authentication step here on purpose; anyone holding the link reaches it,
 * captain or not. It shows the roster-so-far and payment status per player,
 * and a "Register & join the team" CTA — there is no dedicated
 * conduct-management UI today, despite ROLE_SUMMARY_PARAGRAPH's "keeps the
 * roster and conduct organized" framing. The tour caption is written to
 * match what the screen actually does (share the link, see who's joined),
 * not what the copy elsewhere implies it does.
 */
const WORKFLOW = "tour-team-captain";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(60_000);
  const tour = createTour({ workflow: WORKFLOW, role: "team_captain" });

  await tour.step(
    page,
    "Your team page",
    async () => {
      await page.goto(`/team/${E2E_TEAM_REG_TOKEN_ORG_A}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText(/Roster so far/i)).toBeVisible({
        timeout: 15_000,
      });
    },
    { tourSlug: "team-page" },
  );

  await tour.finish();
});

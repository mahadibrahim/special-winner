import { test, expect } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../utils/test-helpers";

// Phone-sized viewport — the close-out screen is mobile-first.
test.use({ viewport: { width: 390, height: 844 } });

test("referee closes out a game from a phone", async ({ page }) => {
  // Authenticates via the password endpoint (no form) and lands on /referee.
  await signIn(page, TEST_USERS.referee.email, TEST_USERS.referee.password);

  await page.goto("/referee", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // The dedicated close-out fixture is a TBD-vs-TBD game (null teams). The
  // referee's only other assigned game (the training walkthrough fixture) has
  // a home team set, so it renders "<team> vs TBD" — this selector is unique.
  await page.getByRole("link", { name: /TBD vs TBD/ }).first().click();

  await expect(page).toHaveURL(/\/referee\/matches\//);
  await waitForHydration(page);

  // Astro's dev toolbar is a dev-server-only overlay pinned to the bottom of
  // the viewport (never present in a production build). It sits on top of the
  // sticky close-out submit bar and intercepts its clicks, so remove it.
  await page.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());

  // Set a final score.
  await page.getByLabel("Increase Home score").click();

  // Answer every section with "None". Clicking is idempotent and safe even
  // when a prior run already closed the game out (edit mode pre-answers None),
  // so re-runs against an already-completed fixture still pass.
  const noneButtons = page.getByRole("button", { name: "None" });
  const sectionCount = await noneButtons.count();
  for (let i = 0; i < sectionCount; i++) {
    await noneButtons.nth(i).click();
  }

  const submit = page.getByTestId("closeout-submit");
  await expect(submit).toBeEnabled();
  await submit.click();

  // On success the screen sends the ref back to their match list.
  await expect(page).toHaveURL(/\/referee\/?$/);
});

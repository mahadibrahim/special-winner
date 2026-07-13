import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";
// Safe to import for constants only — see the guard at the bottom of
// seed-e2e-tests.ts: importing it does NOT run the seed script.
import { E2E_HOST_CLAIMABLE_SESSION_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Post-merge only (test-full) — run locally before merging:
// PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- host-portal

test("host claims a game, checks a player in, submits wrap-up UI is gated", async ({ page }) => {
  await signIn(page, "host@test.aspiresports.com", "TestHost123!");
  await page.goto("/host");
  await waitForHydration(page);

  // Claim the seeded fixture game via the real UI button, when it happens
  // to be visible. The dashboard's claimable list is capped at 25 rows
  // ordered by soonest start, and the shared dev/CI database accumulates
  // many short-lived pickup fixtures from unrelated API test runs — so
  // this fixture (deliberately 7 days out so it doesn't churn) isn't
  // reliably on the visible page. Fall back to claiming directly by its
  // fixed ID (same endpoint the button calls); this is idempotent — a
  // session this host already owns just gets claimed again harmlessly
  // (see assignHostToSession) — so it's safe on every run regardless of
  // prior state.
  const claimable = page.getByTestId("host-claimable-games");
  const fixtureRow = claimable.locator("> div").filter({ hasText: "e2e-host-fixture" });
  const claimButton = fixtureRow.getByRole("button", { name: "Claim" });
  if (await claimButton.isVisible().catch(() => false)) {
    await claimButton.click();
  } else {
    const claimRes = await page.request.post(
      `/api/host/games/${E2E_HOST_CLAIMABLE_SESSION_ID}/claim`,
    );
    expect(claimRes.ok()).toBe(true);
  }

  // "My games" has no such cap or noise (it's scoped to sessions this host
  // hosts), so it reliably shows the fixture once claimed. It also
  // contains the seeded e2e-host-wrapup-fixture, so target by marker text
  // rather than list position.
  await page.goto("/host");
  await waitForHydration(page);
  const myGames = page.getByTestId("host-my-games");
  const fixtureLink = myGames.locator("a", { hasText: "e2e-host-fixture" }).first();
  await expect(fixtureLink).toBeVisible();

  // Open game day.
  await fixtureLink.click();
  await waitForHydration(page);
  await expect(page.getByTestId("fill-meter")).toBeVisible();
  await expect(page.getByTestId("share-game")).toBeVisible();

  // Check the seeded parent player in (undo afterwards to keep re-runs clean).
  const checkIn = page.getByRole("button", { name: "Check in" }).first();
  await checkIn.click();
  await expect(page.getByRole("button", { name: "✓ Here" }).first()).toBeVisible();
  await page.getByRole("button", { name: "✓ Here" }).first().click();

  // Wrap-up section is hidden for a future game (fixture starts in 7 days).
  await expect(page.getByTestId("wrapup-summary")).toHaveCount(0);
});

test("host submits a wrap-up on the started fixture game", async ({ page }) => {
  await signIn(page, "host@test.aspiresports.com", "TestHost123!");
  await page.goto("/host");
  await waitForHydration(page);

  // The seeded wrap-up fixture (already started, already hosted by this
  // user) appears in "My games" — find it by its format label text.
  await page
    .getByTestId("host-my-games")
    .locator("a", { hasText: "e2e-host-wrapup-fixture" })
    .first()
    .click();
  await waitForHydration(page);

  await page.getByTestId("wrapup-summary").fill("Great turnout, teams were even.");
  await page.getByTestId("wrapup-submit").click();
  await expect(page.getByText("Wrap-up submitted")).toBeVisible();
});

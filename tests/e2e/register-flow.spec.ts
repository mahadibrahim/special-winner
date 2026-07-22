import { test, expect, type Page } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// The unified one-door register page. Team-capable seasons open on a
// choose-mode screen ("How do you want to join?"); solo-only seasons skip it
// and render the wizard directly. The e2e seed's adult-soccer season is
// solo-only, so these assertions are written to hold for BOTH shapes.
// (Full team/choose-mode E2E coverage needs a team-capable seed fixture —
// tracked as a follow-up; team linkage itself is covered by tests/api.)

async function openAdultSoccerSeasonId(page: Page): Promise<string | undefined> {
  const res = await page.request.get("/api/public/seasons?sport=soccer&audience=adult");
  const json = await res.json();
  // Only an OPEN season renders the wizard — an "active" (in-progress) season
  // shows the "registration isn't open" banner and the assertions can't hold.
  const seasons: Array<{ id: string; status: string }> = json.seasons ?? [];
  return seasons.find((s) => s.status === "open")?.id;
}

test("register page renders the registration experience @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/${id}?audience=adult`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // Either choose-mode (team-capable) or the wizard's first step (solo-only).
  await expect(
    page.getByText(/who are you registering|registrant info|claim your spot|how do you want to join/i),
  ).toBeVisible({ timeout: 15_000 });
});

test("/register/team/:id redirects to canonical /register/:id @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/team/${id}`, { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain(`/register/${id}`);
  expect(page.url()).not.toContain("/team/");
});

test("the register page reaches the wizard (through choose-mode when present) @critical", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/${id}?audience=adult`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // If choose-mode is shown (team-capable season), pick solo to enter the wizard;
  // otherwise we're already in the wizard.
  const joinSolo = page.getByText(/Join solo/i);
  if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();
  // We are no longer on the choose-mode screen.
  await expect(page.getByRole("heading", { name: /how do you want to join/i })).toHaveCount(0);
});

test("?mode=individual skips the choose-mode screen", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  // Division cards link to /register/{id}?mode=individual, which should skip the
  // "How do you want to join?" chooser and land on the player/guest step directly.
  await page.goto(`/register/${id}?audience=adult&mode=individual`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // Verify the chooser is NOT shown.
  await expect(page.getByRole("heading", { name: /how do you want to join/i })).toHaveCount(0);
  // Verify we're on the player step.
  await expect(
    page.getByText(/who are you registering|registrant info|claim your spot/i)
  ).toBeVisible({ timeout: 15_000 });
});

test("in-app escape banner does not appear under a normal desktop UA", async ({ page }) => {
  const id = await openAdultSoccerSeasonId(page);
  test.skip(!id, "no open adult soccer season in this env");
  await page.goto(`/register/${id}?audience=adult&mode=individual`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(
    page.getByText(/who are you registering|registrant info|claim your spot/i)
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("inapp-escape-banner")).toHaveCount(0);
});

// Real Instagram-in-app-browser UA string (iPhone). Playwright's
// test.use({ userAgent }) overrides navigator.userAgent for the whole
// browser context, which is what isInAppBrowser()/buildBreakoutUrl() read.
test.describe("in-app escape banner (Instagram webview UA)", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.0.0",
  });

  test("banner shows, step content still renders, dismiss hides it", async ({ page }) => {
    const id = await openAdultSoccerSeasonId(page);
    test.skip(!id, "no open adult soccer season in this env");
    await page.goto(`/register/${id}?audience=adult&mode=individual`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const banner = page.getByTestId("inapp-escape-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText(/instagram/i)).toBeVisible();

    // Step content still renders underneath/alongside the banner.
    await expect(
      page.getByText(/who are you registering|registrant info|claim your spot/i)
    ).toBeVisible({ timeout: 15_000 });

    await banner.getByRole("button", { name: /dismiss/i }).click();
    await expect(banner).toHaveCount(0);
  });
});

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
    page
      .getByRole("heading", { name: /how do you want to join/i })
      .or(page.getByText(/who are you registering|registrant info/i)),
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
    page
      .getByText(/who are you registering|registrant info/i)
      .or(page.getByRole("heading", { level: 2, name: /who are you registering/i }))
  ).toBeVisible({ timeout: 15_000 });
});

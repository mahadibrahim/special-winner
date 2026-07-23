import { test, expect, type Page } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

async function teamSeasonId(page: Page): Promise<string | undefined> {
  const res = await page.request.get("/api/public/seasons?status=open");
  const body = await res.json();
  const seasons = body.seasons ?? body ?? [];
  return seasons.find((s: any) => s.slug === "e2e-adult-team-soccer-2026")?.id;
}

test("team-capable season shows choose-mode and reaches team-create @critical", async ({
  page,
}) => {
  const id = await teamSeasonId(page);
  test.skip(!id, "team-capable seed season not present");

  await page.goto(`/register/${id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Choose-mode renders for team-capable seasons (signupModes includes "team").
  await expect(
    page.getByRole("heading", { name: /how do you want to join/i }),
  ).toBeVisible({ timeout: 15_000 });

  // Deposit-first story on the chooser card.
  await expect(page.getByText(/\$200 today/i).first()).toBeVisible();
  await expect(page.getByText(/split with your roster/i).first()).toBeVisible();

  // The "Bring a team" option is present and click-able for anon users.
  const bringTeam = page.getByText(/Bring a team/i).first();
  await expect(bringTeam).toBeVisible();
  await bringTeam.click();

  // One-page reserve (deferred-account flow 2026-07-23): identity is resolved
  // first, so a guest sees the "Reserve your team" screen with an email field
  // and an email-first "Continue" gate — the team name + payment reveal only
  // after a new email is confirmed. Nothing is created until the deposit
  // succeeds, so there's no team-create POST on this screen.
  await expect(page.getByRole("heading", { name: /Reserve your team/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Your email/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible();

  // Guests haven't confirmed their email yet → the team-name field is not shown.
  await expect(page.getByText(/Team name/i)).toHaveCount(0);
});

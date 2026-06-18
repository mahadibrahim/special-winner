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

  // The "Bring a team" option is present and click-able for anon users.
  const bringTeam = page.getByText(/Bring a team/i).first();
  await expect(bringTeam).toBeVisible();
  await bringTeam.click();

  // The team-create captain form renders (no auth required to view it — only
  // submitting the form hits the authed endpoint). Assert on the team-name
  // field label + the create CTA, which render in the initial idle form.
  await expect(page.getByText(/team name/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: /create team & get link/i }),
  ).toBeVisible();
});

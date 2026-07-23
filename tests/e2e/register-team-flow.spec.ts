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

  // The team-create captain form renders in full for anonymous visitors — the
  // create endpoint now accepts anonymous callers directly (guest upsert +
  // recorded backstop consent), so there's no auth gate on the form itself.
  // Assert on the team-name field label + the create CTA, which render in the
  // initial idle form.
  await expect(page.getByText(/team name/i).first()).toBeVisible({ timeout: 10_000 });

  // Fee box: the charge is announced BEFORE the deposit screen…
  await expect(page.getByText(/Today — reserves your team/i)).toBeVisible();
  await expect(page.getByText(/Your card stays on file for the team/i)).toBeVisible();

  // …the button names the charge and is NOT gated on a checkbox (card-on-file
  // is notice, not opt-in — owner decision 2026-07-23)…
  const submitButton = page.getByRole("button", { name: /reserve your team · \$200/i });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await expect(page.getByText(/By reserving, you agree to the payment terms above/i)).toBeVisible();

  // …and the old consent checkbox is gone.
  await expect(
    page.getByRole("checkbox", { name: /save my card to cover unpaid teammate shares/i }),
  ).toHaveCount(0);
});

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

  // One-page reserve (deferred-account flow): a guest sees the FULL "Reserve
  // your team" form immediately — email, team name, your name — no email-first
  // gate. The email is checked in the background (on blur) only to drive a
  // "new here" / "you already have an account" note, never to reveal the form.
  // Nothing is created until the deposit succeeds, so there's no team-create
  // POST on this screen.
  await expect(page.getByRole("heading", { name: /Reserve your team/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Your email/i).first()).toBeVisible();
  // The whole form is present up front (previously hidden behind an email gate).
  await expect(page.getByText(/Team name/i).first()).toBeVisible();
  // Inline deferred deposit: the payment section renders WITH the details —
  // there is no "Continue to payment" reveal click. The $200 Pay button is
  // the single commit action (nothing exists until it succeeds). The Stripe
  // iframe itself requires configured keys, which CI doesn't have — the
  // with-Stripe contract (iframe + a real charge) lives in
  // payment-confirmation.spec.ts, which self-skips without Stripe.
  await expect(page.getByRole("button", { name: /^pay \$200/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /Continue to payment/i })).toHaveCount(0);
});

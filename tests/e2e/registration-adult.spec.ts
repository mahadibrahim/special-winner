import { test, expect } from "@playwright/test";
import { waitForHydration, signIn } from "../utils/test-helpers";

// The adult self-registration flow exercises the "Myself" card path through
// the registration wizard. The adult-self seed user has a birthDate so the
// self option renders and is age-eligible for the Adult 18+ season. This is an
// adult-locked (minAge 18) season, so the wizard runs the v2 flow: no
// pre-payment agreements/waiver step — Player advances straight to Payment.

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

test.describe("Adult self registration", { tag: "@critical" }, () => {
  test.setTimeout(120_000);

  let seasonId: string;

  test.beforeAll(async ({ request }) => {
    // The adult season IS returned by the public seasons API (isTest flag not
    // set on this particular fixture). We fetch all open seasons and find ours
    // by slug.
    const res = await request.get("/api/public/seasons?status=open");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
    const match = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);

    // Fallback: if the season didn't appear in the open-filtered list (e.g. it
    // was closed or the isTest column got set), try fetching all seasons.
    if (!match) {
      const allRes = await request.get("/api/public/seasons");
      expect(allRes.ok()).toBe(true);
      const allData = await allRes.json();
      const allSeasons: Array<{ id: string; slug: string }> = allData.seasons ?? [];
      const fallback = allSeasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);
      expect(
        fallback,
        `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — run npm run db:seed:e2e`,
      ).toBeTruthy();
      seasonId = fallback!.id;
    } else {
      seasonId = match.id;
    }

    expect(seasonId).toBeTruthy();
  });

  test("adult can sign in, pick Myself, and reach payment step directly (v2)", async ({
    page,
  }) => {
    // 1. Sign in as the adult self-registration test user
    await signIn(page, "adult-self@test.aspiresports.com", "TestParent123!");
    // signIn waits for post-login navigation away from /signin
    await expect(page).toHaveURL(/\/(dashboard|admin)/);

    // 2. Navigate to the adult season's registration page
    await page.goto(`/register/${seasonId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // One-door flow: choose-mode now precedes the wizard on team-capable seasons.
    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();

    // Wait for the loading spinner to disappear (wizard fetches season data)
    await page
      .waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 })
      .catch(() => {
        // No spinner shown — that's fine
      });

    // 3. Step 1: Who are you registering?
    await expect(page.getByText("Who are you registering?")).toBeVisible({ timeout: 10_000 });

    // The "Myself" card renders as "Myself — Adult Self"
    const myselfCard = page.getByText(/Myself —/);
    await expect(myselfCard).toBeVisible({ timeout: 10_000 });
    await myselfCard.click();

    // Confirm selection registered (card gets ring-2 class via aria-pressed)
    const myselfCardContainer = page.locator('[role="button"]').filter({ hasText: /Myself —/ });
    await expect(myselfCardContainer).toHaveAttribute("aria-pressed", "true");

    // Advance — v2 (adult-locked) has no agreements/waiver step, so a single
    // Continue goes straight from the Player step to Payment. The waiver is
    // deferred to a post-payment completion step.
    await page.getByRole("button", { name: /continue/i }).click();

    // The waiver step must NOT appear pre-payment in the v2 flow.
    await expect(page.getByText(/Participant Waiver/i)).not.toBeVisible();

    // 4. Payment step — verify order summary shows the registrant's name
    // "Registration for" row contains the registrant display name
    await expect(page.getByText(/Payment Option/i)).toBeVisible({ timeout: 10_000 });

    // Specifically confirm "Adult Self" appears in the order summary section.
    // The order summary card has class "bg-primary/10" — we scope to the div
    // that contains the "Registration for" label so we don't match the button.
    const registrationForRow = page
      .locator("div")
      .filter({ hasText: /Registration for/i })
      .filter({ hasText: /Adult Self/i })
      .first();
    await expect(registrationForRow).toBeVisible({ timeout: 10_000 });
    await expect(registrationForRow).toContainText("Adult Self");

    // Do NOT click "Complete Registration" — we don't want to hit Stripe.
    // Reaching this step confirms the adult self-registration wizard path works.
  });
});

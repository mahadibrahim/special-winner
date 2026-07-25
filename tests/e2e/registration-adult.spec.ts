import { test, expect, type Locator, type Page } from "@playwright/test";
import { waitForHydration, signIn } from "../utils/test-helpers";

// The adult self-registration flow exercises the "Myself" card path through
// the registration wizard. The adult-self seed user has a birthDate so the
// self option renders and is age-eligible for the Adult 18+ season. This is an
// adult-locked (minAge 18) season, so the wizard runs the v2 flow: no
// pre-payment agreements/waiver step — Player advances straight to Payment.

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

// Locator.isVisible({ timeout }) is a documented no-op in Playwright — it
// does NOT wait, the option is ignored and it checks immediately. Several
// checks below need real polling (the wizard's up-front state resolves
// async, after an internal loading gate), so this wraps waitFor() instead.
async function appears(locator: Locator, timeout = 8_000): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * This account/season pair is shared with several API suites that
 * create-but-never-confirm registrations here (see
 * tests/api/registrations-self.test.ts, registrations-membership.test.ts),
 * so a pending+unpaid self-registration for this season is very likely to
 * already exist by the time these specs run. Task 5 surfaces that state up
 * front now (not just behind ?payment=cancelled), so a spec that wants a
 * *fresh* Player → Payment walk needs to dismiss the resume card first via
 * "Start over" — that only clears the wizard's local resume state; the
 * underlying pending row (if any) is untouched and just gets resumed again
 * on the next payment-method commit.
 *
 * Returns "already-registered" when the account is fully blocked (a
 * confirmed/paid row renders the "You're already in" state) — callers
 * should skip in that case; there's no "start over" out of it, and clearing
 * it isn't this suite's job.
 */
async function clearAnyResumeState(page: Page): Promise<"clear" | "already-registered"> {
  if (await appears(page.getByText(/You're already in/i))) {
    return "already-registered";
  }
  const startOver = page.getByRole("button", { name: /start over/i });
  if (await appears(startOver, 3_000)) {
    await startOver.click();
  }
  return "clear";
}

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

    // Task 5: this account may already have a resumable or blocking
    // registration for this season from other suites (see
    // clearAnyResumeState above) — dismiss the resume card, or skip
    // outright if fully blocked, so this test's fresh-wizard walk is
    // deterministic regardless of prior test runs.
    const priorState = await clearAnyResumeState(page);
    test.skip(
      priorState === "already-registered",
      "Account already has a confirmed registration for this season",
    );

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

  test("returning to the register page after starting payment shows the resume card (Task 5)", async ({
    page,
  }) => {
    // Selecting a payment method is what actually creates the registration
    // (POST /api/registrations) — it's the single commit action on this
    // step, there's no separate "continue" button. We deliberately go this
    // far (but no further — never completing the embedded Stripe form) so
    // the account ends up with a real, deterministic pending+unpaid row for
    // this season: either freshly created here, or resumed if a prior test
    // run already left one (this account/season pair is shared with several
    // API suites that create-but-never-confirm registrations here — see
    // tests/api/registrations-self.test.ts and registrations-membership.test.ts).
    // Either way the row stays pending+unpaid, since nothing in this suite
    // ever completes a real Stripe payment against it.
    await signIn(page, "adult-self@test.aspiresports.com", "TestParent123!");
    await expect(page).toHaveURL(/\/(dashboard|admin)/);

    await page.goto(`/register/${seasonId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const joinSolo = page.getByText(/Join solo/i);
    if (await appears(joinSolo, 8_000)) await joinSolo.click();

    // If a prior run already left this account already-registered (e.g. a
    // confirmed row from some unrelated flow), the wizard short-circuits to
    // the "You're already in" state instead of Player/Payment — that's still
    // a valid Task 5 state, just not the one this test targets. Skip rather
    // than false-fail in that case.
    if (await appears(page.getByText(/You're already in/i), 10_000)) {
      test.skip(true, "Account already has a confirmed registration for this season");
    }

    // If we land straight on the resume card (a prior run already created
    // the pending row — very likely, see the comment above), there's
    // nothing left to do — assert directly.
    const resumeHeading = page.getByText(/Finish your payment/i);
    if (await appears(resumeHeading, 3_000)) {
      await expect(resumeHeading).toBeVisible();
      return;
    }

    // Otherwise, walk through Player → Payment and commit to a method to
    // create a fresh pending+unpaid row ourselves.
    await expect(page.getByText("Who are you registering?")).toBeVisible({ timeout: 10_000 });
    const myselfCard = page.getByText(/Myself —/);
    await expect(myselfCard).toBeVisible({ timeout: 10_000 });
    await myselfCard.click();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText(/Payment Option/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /card or wallet/i }).click();

    // Wait for the POST to settle — either the embedded Stripe form mounts,
    // or (Stripe not configured locally) the request still creates the
    // pending registration row even if the checkout-session step 404s/503s.
    await page
      .waitForSelector("text=Payment Details", { timeout: 15_000 })
      .catch(() => {});

    // Revisit the registration page on a plain, direct load — no
    // ?payment=cancelled param. Task 5 widens the resume-payment fetch to
    // run unconditionally for signed-in users, so the card must render here
    // too, not just on the cancelled-checkout redirect.
    await page.goto(`/register/${seasonId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.getByText(/Finish your payment/i)).toBeVisible({ timeout: 15_000 });
  });
});

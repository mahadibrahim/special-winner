import { test, expect } from "@playwright/test";
import { waitForHydration, signIn, TEST_USERS } from "../utils/test-helpers";

// This test exercises the guest (anonymous) adult self-registration path under
// the v2 (adult-locked) flow: an adult lands on
// /register/[seasonId]?audience=adult, the wizard runs the minimal "Claim your
// spot" step (name + email only — no DOB, no waiver, no mode toggle) and a
// single Continue reaches the Payment step. The waiver + player details are
// deferred to a post-payment completion step.

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

test.describe("Anonymous adult guest checkout (v2)", { tag: "@critical" }, () => {
  test.setTimeout(120_000);

  let seasonId: string;

  test.beforeAll(async ({ request }) => {
    // Resolve the adult season ID from the public API.
    const res = await request.get("/api/public/seasons?status=open");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
    let match = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);

    if (!match) {
      // Fallback: try without status filter in case the season is not "open"
      const allRes = await request.get("/api/public/seasons");
      expect(allRes.ok()).toBe(true);
      const allData = await allRes.json();
      const allSeasons: Array<{ id: string; slug: string }> = allData.seasons ?? [];
      match = allSeasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);
      expect(
        match,
        `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — run npm run db:seed:e2e`,
      ).toBeTruthy();
    }

    seasonId = match!.id;
    expect(seasonId).toBeTruthy();
  });

  test("anonymous adult reaches payment in one Continue (name + email only)", async ({ page }) => {
    // Navigate as anonymous user with ?audience=adult
    await page.goto(`/register/${seasonId}?audience=adult`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // One-door flow: choose-mode now precedes the wizard on team-capable seasons.
    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();

    // Wait for wizard to finish loading season data (spinner disappears)
    await page
      .waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 })
      .catch(() => {
        // No spinner — that's fine
      });

    // ── Step 1 (v2 minimal): "Claim your spot" — name + email only. The
    // mode toggle is hidden (adult-locked) and there's no birth-date field. ──
    await expect(
      page.getByRole("heading", { name: "Claim your spot" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#mode-adult")).toHaveCount(0);
    await expect(page.locator("#mode-child")).toHaveCount(0);
    // No birth-date field in the minimal step.
    await expect(
      page.locator("div.space-y-2").filter({ has: page.locator("label", { hasText: "Birth date *" }) }),
    ).toHaveCount(0);

    // ── Fill the minimal fields (name + email) ──
    const firstNameInput = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: "First name *" }) })
      .first()
      .locator("input");

    const lastNameInput = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: "Last name *" }) })
      .first()
      .locator("input");

    const emailInput = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: "Email *" }) })
      .locator("input");

    await firstNameInput.fill("Floor");
    await lastNameInput.fill("Walker");
    await emailInput.fill(`floor-walker-${Date.now()}@example.com`);

    // ── Single Continue → Payment step (no agreements interstitial in v2) ──
    await page.getByRole("button", { name: /continue/i }).click();

    // The waiver step must NOT appear — it's deferred to post-payment.
    await expect(page.getByText(/Participant Waiver/i)).not.toBeVisible();

    // Payment step confirms registrant name in the order summary.
    await expect(page.getByText(/Payment Option/i)).toBeVisible({ timeout: 10_000 });

    const registrationForRow = page
      .locator("div")
      .filter({ hasText: /Registration for/i })
      .filter({ hasText: /Floor Walker/i })
      .first();
    await expect(registrationForRow).toBeVisible({ timeout: 10_000 });
    await expect(registrationForRow).toContainText("Floor Walker");
  });

  test("empty Continue attempt surfaces per-field errors instead of a dead button", async ({ page }) => {
    await page.goto(`/register/${seasonId}?audience=adult`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();

    await expect(
      page.getByRole("heading", { name: "Claim your spot" }),
    ).toBeVisible({ timeout: 10_000 });

    // Continue is tappable even with an empty form — tapping it flags the
    // missing fields rather than silently doing nothing.
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await expect(page.getByText("Enter your first name.")).toBeVisible();
    await expect(page.getByText("Enter your email.")).toBeVisible();
    await expect(page.getByText(/Fix the highlighted fields/i)).toBeVisible();
    // Still on step 1 — the payment step never rendered.
    await expect(page.getByText(/Payment Option/i)).not.toBeVisible();

    // Errors clear live as fields are fixed.
    const firstNameInput = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: "First name *" }) })
      .first()
      .locator("input");
    await firstNameInput.fill("Floor");
    await expect(page.getByText("Enter your first name.")).not.toBeVisible();
  });

  test("mode toggle and DOB are hidden on an adult-only season (v2 minimal)", async ({ page }) => {
    // Adult-only season (minAge ≥ 18) → the wizard runs the v2 minimal step:
    // no parent/adult radio toggle, and no birth-date field (DOB is deferred
    // to the post-payment completion step).
    await page.goto(`/register/${seasonId}?audience=adult`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page
      .waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 })
      .catch(() => {});

    await expect(page.locator("#mode-adult")).toHaveCount(0);
    await expect(page.locator("#mode-child")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Claim your spot" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("div.space-y-2").filter({ has: page.locator("label", { hasText: "Birth date *" }) }),
    ).toHaveCount(0);
  });
});

// The two specs above stop at the payment step — the wizard hands off to a
// Stripe Elements iframe there, and no e2e spec in this repo drives a real
// card through Stripe test mode to actually complete a payment (see the
// iframe-mount-only assertions in registration-guest-flow.spec.ts). So the
// v2 completion form's "reached confirm, signed the deferred waiver" path
// is exercised as a standalone spec against the resume page instead of by
// continuing this wizard flow through to confirm.
test.describe("Post-payment completion resume page (/account/complete)", () => {
  test("visiting a registration you don't own 404s", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    // A syntactically valid uuid guaranteed not to exist (or, even if it
    // somehow collided, not owned by the signed-in parent) — the endpoint
    // returns 404 either way, so no seeded fixture is needed for this case.
    const notOwnedId = "00000000-0000-4000-8000-000000000000";
    const res = await page.goto(`/account/complete/${notOwnedId}`, {
      waitUntil: "domcontentloaded",
    });
    const status = res!.status();
    if (status === 404) {
      expect(status).toBe(404);
    } else {
      // Astro.rewrite("/404") dev-vs-prod quirk (see location-pages.spec.ts):
      // dev can return 200 with the 404 page's content instead of a 404
      // status. Fall back to asserting the rendered content.
      expect(status).toBe(200);
      await expect(page.locator("h1")).toContainText(/couldn't find that page/i);
    }
  });

  // Owner-path coverage (visit your own unsigned registration, sign the
  // waiver via CompletionForm, assert the success copy and that
  // waiverSigned flips to true) needs a seeded v2 registration owned by the
  // parent test account with waiverSigned: false — that fixture doesn't
  // exist yet (Task 11 wires the email-reminder flow that will need the
  // same fixture and is expected to add it to seed-e2e-tests.ts). Gated on
  // an env var so this activates the moment that fixture id is exported,
  // without another spec-file edit.
  const unsignedRegistrationId = process.env.E2E_UNSIGNED_REGISTRATION_ID;

  test("owner signs the deferred waiver from the resume page", async ({ page }) => {
    test.skip(
      !unsignedRegistrationId,
      "requires E2E_UNSIGNED_REGISTRATION_ID (seeded unsigned v2 registration owned by parent@test.aspiresports.com) — not wired until Task 11",
    );

    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
    await page.goto(`/account/complete/${unsignedRegistrationId}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    await expect(page.getByText(/You're in — finish before game 1/i)).toBeVisible();

    // Matches the convention in registration-guest-flow.spec.ts: the waiver
    // checkbox is a Radix button (role="checkbox"), addressed by id rather
    // than getByLabel.
    await page.locator("#completion-waiver-accept").check();
    await page.getByPlaceholder("Type your full legal name").fill("Test Parent");
    await page.getByRole("button", { name: /sign & finish/i }).click();

    await expect(page.getByText(/You're all set for game 1\./i)).toBeVisible({
      timeout: 10_000,
    });

    // The completion endpoint is POST-only and idempotent — re-POSTing is
    // the way to verify the signed state via the API without a separate
    // GET endpoint. A freshly-signed registration returns alreadySigned.
    const verify = await page.request.post(
      `/api/registrations/${unsignedRegistrationId}/complete`,
      {
        data: { waiverAccepted: true, waiverSignature: "Test Parent" },
      },
    );
    expect(verify.ok()).toBe(true);
    const body = await verify.json();
    expect(body.alreadySigned).toBe(true);
  });
});

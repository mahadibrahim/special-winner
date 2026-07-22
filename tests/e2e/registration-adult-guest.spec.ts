import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

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

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// This test exercises the guest (anonymous) adult self-registration path:
// an adult lands on /register/[seasonId]?audience=adult, the wizard defaults
// to adult mode, shows the registrant-info form (with birth date), and the
// waiver step shows self-flavored copy ("I, [name], agree to participate…").

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

test.describe("Anonymous adult guest checkout", { tag: "@critical" }, () => {
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

  test("anonymous adult can register themselves via guest checkout", async ({ page }) => {
    // Navigate as anonymous user with ?audience=adult
    await page.goto(`/register/${seasonId}?audience=adult`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Wait for wizard to finish loading season data (spinner disappears)
    await page
      .waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 })
      .catch(() => {
        // No spinner — that's fine
      });

    // ── Step 1: adult-only season → mode is locked to "adult" and the
    // parent/adult radio toggle is hidden (the wizard derives the mode
    // from season.ageGroup.minAge ≥ 18). The adult registrant form
    // (headed "Registrant info") should render directly. ──
    await expect(
      page.getByRole("heading", { name: "Registrant info" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#mode-adult")).toHaveCount(0);

    // ── Fill adult registrant fields ──
    // Labels in the wizard have no htmlFor — use the container + label text pattern
    // (matching the pattern established in registration-guest-flow.spec.ts).
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

    // Birth date — in adult mode the birth date input is rendered directly
    // under "Registrant info" (not under a "Player" section)
    const birthDateInput = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: "Birth date *" }) })
      .locator("input");

    await firstNameInput.fill("Floor");
    await lastNameInput.fill("Walker");
    await emailInput.fill(`floor-walker-${Date.now()}@example.com`);
    await birthDateInput.fill("1985-06-15");

    // Confirm proceed is enabled and advance
    await page.getByRole("button", { name: /continue/i }).click();

    // ── Step 2: Waiver — self-flavored copy for guest+adult ──
    await expect(page.getByText(/Participant Waiver/i)).toBeVisible({ timeout: 10_000 });

    // "I, Floor Walker, agree to participate…" copy must be visible
    await expect(
      page.locator("p").filter({ hasText: /I,.*Floor Walker.*agree to participate/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Dependent-flavored "I have read…on behalf of" checkbox label should NOT appear
    await expect(
      page.locator("label").filter({ hasText: /on behalf of/i }),
    ).not.toBeVisible();

    // Accept waiver and sign
    await page.locator("#waiver").check();
    await expect(page.locator("#waiver")).toBeChecked();

    const sigField = page
      .locator("div.space-y-2")
      .filter({ has: page.locator("label", { hasText: /Digital Signature/i }) })
      .locator("input");
    await sigField.fill("Floor Walker");

    // Advance to Step 3 (Media authorization — defaults grant all 3 scopes)
    await page.getByRole("button", { name: /continue/i }).click();

    // Advance to Step 4 (Payment) — but don't submit (no real Stripe in test env)
    await page.getByRole("button", { name: /continue/i }).click();

    // ── Step 4: Payment step confirms registrant name ──
    await expect(page.getByText(/Payment Option/i)).toBeVisible({ timeout: 10_000 });

    // Order summary should show "Floor Walker" not a child name
    const registrationForRow = page
      .locator("div")
      .filter({ hasText: /Registration for/i })
      .filter({ hasText: /Floor Walker/i })
      .first();
    await expect(registrationForRow).toBeVisible({ timeout: 10_000 });
    await expect(registrationForRow).toContainText("Floor Walker");
  });

  test("mode toggle is hidden on an adult-only season", async ({ page }) => {
    // Adult-only season (minAge ≥ 18) → the wizard locks the mode to
    // "adult" and removes the parent/adult radio toggle entirely.
    // Registering a child on an adult-only program makes no sense, so
    // the toggle is correctly absent.
    await page.goto(`/register/${seasonId}?audience=adult`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page
      .waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 })
      .catch(() => {});

    await expect(page.locator("#mode-adult")).toHaveCount(0);
    await expect(page.locator("#mode-child")).toHaveCount(0);
    // Heading from the locked-adult registrant form, not the toggle prompt.
    await expect(
      page.getByRole("heading", { name: "Registrant info" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

import { test, expect } from "@playwright/test";
import { waitForHydration, signIn } from "../utils/test-helpers";

// The adult self-registration flow exercises the "Myself" card path through
// the registration wizard. The adult-self seed user has a birthDate so the
// self option renders and is age-eligible for the Adult 18+ season.

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

  test("adult can sign in, pick Myself, complete waiver, and reach payment step", async ({
    page,
  }) => {
    // 1. Sign in as the adult self-registration test user
    await signIn(page, "adult-self@test.aspiresports.com", "TestParent123!");
    // signIn waits for post-login navigation away from /signin
    await expect(page).toHaveURL(/\/(dashboard|admin)/);

    // 2. Navigate to the adult season's registration page
    await page.goto(`/register/${seasonId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

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

    // Advance to Step 2
    await page.getByRole("button", { name: /continue/i }).click();

    // 4. Step 2: Waiver — self-flavored copy
    await expect(page.getByText(/Participant Waiver/i)).toBeVisible({ timeout: 10_000 });

    // Self registration renders: "I, Adult Self, agree to participate in this program"
    // We scope to the <p> element directly to avoid matching the broader waiver
    // box text that also contains "I authorize" (medical authorization clause).
    await expect(
      page.locator("p").filter({ hasText: /I,.*agree to participate/i }),
    ).toBeVisible({ timeout: 5_000 });

    // The dependent branch paragraph ("I authorize [name] to participate…") must
    // NOT be in the DOM when selectedKey === "self". Scope strictly to <p> tags
    // to avoid a false positive from the static waiver body (which contains
    // "I authorize Aspire Sports staff…" and later "…participate" in the same
    // normalized text block when Playwright evaluates a parent element).
    await expect(
      page.locator("p").filter({ hasText: /I authorize.*to participate/i }),
    ).not.toBeVisible();

    // Check the "I agree" checkbox (id="waiver")
    await page.locator("#waiver").check();
    await expect(page.locator("#waiver")).toBeChecked();

    // Fill the digital signature field
    const sigField = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: /Digital Signature/i }) })
      .locator('input');
    await sigField.fill("Adult Self");

    // Advance to the Payment step. The waiver and the (optional, collapsed)
    // media-consent section now share one "Agreements" step, so this is a
    // single Continue rather than two.
    await page.getByRole("button", { name: /continue/i }).click();

    // 5. Payment step — verify order summary shows the registrant's name
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

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// The registration wizard's guest-mode Step 1 renders label+input pairs where
// <Label> has no htmlFor and <Input> has no id — so getByLabel() won't match.
// We locate inputs by filtering for the div.space-y-2 container whose label
// text matches, then grabbing the input inside that container.

test.describe("Anonymous registration (guest checkout)", { tag: "@critical" }, () => {
  test.setTimeout(120_000);

  test("anonymous visitor can fill the wizard and reach Stripe embedded checkout", async ({ page, request }) => {
    // Pin the YOUTH seed season by slug. This spec fills the full parent+child
    // form, which only renders for youth/ambiguous seasons — adult-locked
    // seasons get the minimal name+email form (covered by
    // registration-adult-guest.spec.ts). Picking "the first open season with
    // capacity" silently flipped to an adult season once shared-staging
    // capacity state drifted (the multi-tenant "never trust the first match"
    // hazard, e2e edition).
    const seasonsRes = await request.get("/api/public/seasons?status=open");
    expect(seasonsRes.ok()).toBe(true);
    const seasonsBody = await seasonsRes.json();
    const seasons = seasonsBody.seasons ?? [];
    const season = seasons.find(
      (s: { slug?: string }) => s.slug === "e2e-test-spring-2026",
    );
    expect(season, "expected seeded youth season e2e-test-spring-2026 — re-seed e2e data").toBeTruthy();

    // Visit the registration page as an anonymous visitor
    await page.goto(`/register/${season.id}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // One-door flow: choose-mode now precedes the wizard on team-capable seasons.
    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();

    // Sanity: no redirect to /signin
    expect(page.url()).toContain(`/register/${season.id}`);

    // Wait for the wizard to finish loading (spinner disappears)
    await page.waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 }).catch(() => {
      // If no spinner was shown, that's fine too
    });

    // Step 1 — parent + child
    // The wizard renders two "First name *" / "Last name *" label+input pairs.
    // Labels have no htmlFor; we find them via container structure:
    //   div.space-y-2 > Label + Input
    // We get all inputs in the guest Step 1 form in DOM order.
    const uniqueEmail = `e2e-guest-${Date.now()}@example.com`;

    // Parent section: "About you" — inputs appear before child section
    // Using locator for label text then finding the adjacent input via xpath
    const parentFirstInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "First name *" }) })
      .first()
      .locator('input');

    const parentLastInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Last name *" }) })
      .first()
      .locator('input');

    const emailInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Email *" }) })
      .locator('input');

    // Child (player) section — second occurrence of "First name *" / "Last name *"
    const childFirstInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "First name *" }) })
      .nth(1)
      .locator('input');

    const childLastInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Last name *" }) })
      .nth(1)
      .locator('input');

    const birthDateInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Birth date *" }) })
      .locator('input');

    await parentFirstInput.fill("E2E");
    await parentLastInput.fill("Parent");
    await emailInput.fill(uniqueEmail);
    await childFirstInput.fill("E2E");
    await childLastInput.fill("Kid");

    // Mid-range DOB derived from the season's OWN age-group bounds + its
    // startDate (both already on the `season` object from the API call
    // above) rather than a hardcoded U8/age-7 assumption or a fixed
    // literal — stays valid as the seed's season start date and/or
    // age-group config drifts.
    // CAUTION (audit F1): the previous fixture, 2018-06-01, sat EXACTLY on
    // U8's max-age boundary against the live season startDate — pick DOBs
    // with comfortable slack, not boundary values.
    const seasonStart = new Date(season.startDate);
    const ageGroup: { minAge: number | null; maxAge: number | null } | null = season.ageGroup ?? null;
    const minAge = ageGroup?.minAge ?? null;
    const maxAge = ageGroup?.maxAge ?? null;
    const midAge =
      minAge != null && maxAge != null
        ? Math.round((minAge + maxAge) / 2)
        : (minAge ?? maxAge ?? 10);
    const midRangeChildBirthDate = `${seasonStart.getUTCFullYear() - midAge}-01-15`;
    // Deliberately out-of-range (audit F1 negative case): ~20 years before
    // today, well past any youth age group's max bound.
    const outOfRangeChildBirthDate = `${new Date().getFullYear() - 20}-01-15`;

    // ── Negative case (a): out-of-range DOB blocks Continue with the
    // audit F1 inline message, before the COPPA box is even touched. ──
    await birthDateInput.fill(outOfRangeChildBirthDate);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/is for ages/i)).toBeVisible();
    await expect(page.getByText(/Payment Option/i)).not.toBeVisible();

    // ── Negative case (b): DOB fixed, but the COPPA box is still
    // unchecked — Continue stays blocked on the consent requirement. ──
    await birthDateInput.fill(midRangeChildBirthDate);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/Check the box to confirm parental consent/i)).toBeVisible();
    await expect(page.getByText(/Payment Option/i)).not.toBeVisible();

    // COPPA (audit finding F2): required parental-consent checkbox — the
    // guest-checkout API 400s without `parentalConsent: true` and Continue
    // is client-blocked until it's checked. Matches the codebase convention
    // (see registration-adult-guest.spec.ts) of addressing a Radix checkbox
    // (role="checkbox") by id rather than getByLabel.
    await page.locator("#guest-child-parental-consent").check();

    // ── Single Continue → Payment. Youth now runs the v2 step list
    // (Player → Payment → Confirm): the Agreements interstitial is gone and
    // the guardian signs the waiver on the post-payment completion form. ──
    await page.getByRole("button", { name: /continue/i }).click();

    // The agreements step must NOT appear — no pre-payment waiver for youth.
    await expect(page.locator("#waiver")).toHaveCount(0);
    await expect(page.getByText(/Participant Waiver/i)).not.toBeVisible();

    // The 3-dot progress header replaced the 4-step one.
    await expect(page.getByText("Agreements")).toHaveCount(0);

    // Payment step reached in ONE Continue.
    await expect(page.getByText(/Payment Option/i)).toBeVisible({ timeout: 15_000 });

    // Step 2 — Payment: card-only checkout renders the Stripe card form INLINE
    // immediately — there is NO method-picker click. The registration row +
    // PaymentIntent are created only on Pay (deferred), so simply reaching this
    // step must mount the embedded Stripe Elements iframe. Wallets (Apple /
    // Google Pay) ride on the same element; Link / ACH / Klarna are disabled
    // account-wide.
    const errorBannerLocator = page.locator("[class*='destructive']");
    const stripeIframeLocator = page.locator('iframe[name^="__privateStripeFrame"]').first();

    await Promise.race([
      stripeIframeLocator.waitFor({ state: "visible", timeout: 30_000 })
        .catch(() => { /* iframe didn't mount within 30s */ }),
      page.waitForURL((u) => !u.href.includes(`/register/${season.id}`), { timeout: 30_000 })
        .catch(() => { /* navigation didn't happen within 30s */ }),
      errorBannerLocator.waitFor({ state: "visible", timeout: 30_000 })
        .catch(() => { /* no error banner */ }),
    ]);

    // Allow any in-progress navigation to settle
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});

    const url = page.url();
    const stripeIframeMounted = (await stripeIframeLocator.count()) > 0;
    const onDashboard = /\/dashboard/.test(url);
    const hasErrorBanner =
      (await page.getByText(/Payment processing is not configured/i).count()) > 0 ||
      (await page.getByText(/couldn't start your payment/i).count()) > 0 ||
      (await page.getByText(/Failed to complete registration/i).count()) > 0 ||
      (await errorBannerLocator.count()) > 0;

    expect(
      stripeIframeMounted || onDashboard || hasErrorBanner,
      `expected Stripe Elements iframe to mount inline, navigation to /dashboard, or a Stripe-config error banner; got url=${url}, iframeCount=${await stripeIframeLocator.count()}`,
    ).toBe(true);
  });

  test("collision subcopy appears when email matches an existing account", async ({ page, request }) => {
    const seasonsRes = await request.get("/api/public/seasons?status=open");
    const seasonsBody = await seasonsRes.json();
    const season = (seasonsBody.seasons ?? [])[0];
    expect(season, "expected at least one open season").toBeTruthy();

    await page.goto(`/register/${season.id}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // One-door flow: choose-mode now precedes the wizard on team-capable seasons.
    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false)) await joinSolo.click();

    // Wait for wizard to finish loading
    await page.waitForSelector("[class*='animate-spin']", { state: "detached", timeout: 15_000 }).catch(() => {});

    // Fill in the known existing parent email
    const emailInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Email *" }) })
      .locator('input');

    await emailInput.fill("parent@test.aspiresports.com");

    // Trigger blur by clicking into the phone field
    const phoneInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Phone (optional)" }) })
      .locator('input');
    await phoneInput.click();

    // The collision check has a 400ms debounce — wait for the subcopy
    await expect(
      page.getByText(/We already have an account with this email/i),
    ).toBeVisible({ timeout: 5_000 });
  });
});

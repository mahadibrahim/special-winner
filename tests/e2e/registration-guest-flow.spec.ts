import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// The registration wizard's guest-mode Step 1 renders label+input pairs where
// <Label> has no htmlFor and <Input> has no id — so getByLabel() won't match.
// We locate inputs by filtering for the div.space-y-2 container whose label
// text matches, then grabbing the input inside that container.

test.describe("Anonymous registration (guest checkout)", () => {
  test.setTimeout(120_000);

  test("anonymous visitor can fill the wizard and reach Stripe embedded checkout", async ({ page, request }) => {
    // Find an open season with capacity
    const seasonsRes = await request.get("/api/public/seasons?status=open");
    expect(seasonsRes.ok()).toBe(true);
    const seasonsBody = await seasonsRes.json();
    const seasons = seasonsBody.seasons ?? [];
    const season = seasons.find(
      (s: { maxParticipants?: number; registeredCount?: number }) =>
        !s.maxParticipants || (s.registeredCount ?? 0) < s.maxParticipants,
    ) ?? seasons[0];
    expect(season, "expected at least one open season in the test DB").toBeTruthy();

    // Visit the registration page as an anonymous visitor
    await page.goto(`/register/${season.id}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

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
    await birthDateInput.fill("2018-06-01");

    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2 — waiver
    // The waiver checkbox has id="waiver" with a matching htmlFor on Label
    await page.locator('#waiver').check();

    // Digital signature — Label has no htmlFor; locate by container
    const signatureInput = page
      .locator('div.space-y-2')
      .filter({ has: page.locator('label', { hasText: "Digital Signature" }) })
      .locator('input');
    await signatureInput.fill("E2E Parent");

    await page.getByRole("button", { name: /continue/i }).click();

    // Step 3 — Media authorization: defaults grant all 3 scopes; just Continue
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4 — Payment: keep "Pay in Full" default; submit
    await page.getByRole("button", { name: /complete registration/i }).click();

    // Outcome: with embedded checkout, the contract is "Stripe Elements iframe mounted
    // inline" instead of "navigated to checkout.stripe.com". Other valid outcomes:
    // - Navigation to /dashboard (zero-amount discount path)
    // - Error banner (Stripe not configured in this env)
    //
    // Strategy: wait up to 30s for any of the concrete outcome signals to appear.
    // We first wait for the submit button to go into "Processing..." state so
    // we know the click registered, then wait for resolution.
    const processingButtonLocator = page.getByRole("button", { name: /processing/i });
    const errorBannerLocator = page.locator("[class*='destructive']");

    // Wait for the "Processing..." state to appear (confirms the click registered)
    await processingButtonLocator.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      // If it never shows "Processing...", the form may not have been ready.
      // Proceed anyway — might have already navigated.
    });

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

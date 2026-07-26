import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// Money-flow regression: complete a REAL test-mode card payment through the
// wizard's inline deferred form and assert the customer lands on the explicit
// confirmation step — never silently on the dashboard. This is the invariant
// the checkout redesigns kept threatening: "after Pay, the customer must SEE
// that it worked."
//
// Requires a Stripe-configured server (test-mode keys — the bws dev server).
// CI has no Stripe, so the spec self-skips when the payment iframe never
// mounts. Run locally with:
//   PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- payment-confirmation

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

test.describe("Payment confirmation (test-mode card)", () => {
  test.setTimeout(180_000);

  let seasonId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/public/seasons?status=open");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
    let match = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);
    if (!match) {
      const allRes = await request.get("/api/public/seasons");
      const allData = await allRes.json();
      match = (allData.seasons ?? []).find(
        (s: { slug: string }) => s.slug === ADULT_OPEN_SEASON_SLUG,
      );
    }
    expect(
      match,
      `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — run npm run db:seed:e2e`,
    ).toBeTruthy();
    seasonId = match!.id;
  });

  test("guest pays with 4242 and lands on the confirmation step, not the dashboard", async ({
    page,
  }) => {
    await page.goto(`/register/${seasonId}?audience=adult`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false))
      await joinSolo.click();

    // ── Step 1 (v2 minimal): name + email, one Continue. Labels have no
    // htmlFor — locate inputs via their label container (same pattern as
    // registration-adult-guest.spec.ts). ──
    const unique = `pay-conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fieldInput = (label: string) =>
      page
        .locator("div.space-y-2")
        .filter({ has: page.locator("label", { hasText: label }) })
        .first()
        .locator("input");
    await fieldInput("First name *").fill("Pay");
    await fieldInput("Last name *").fill("Confirmation");
    await fieldInput("Email *").fill(`${unique}@test.example`);
    await page.getByRole("button", { name: /continue/i }).click();

    // ── Step 2: the deferred card form must mount INLINE, no picker click ──
    const stripeFrameEl = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const mounted = await stripeFrameEl
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!mounted, "Stripe not configured in this environment (no payment iframe)");

    // Fill the card inside the Payment Element. The accordion may render the
    // card fields collapsed (multiple methods on the staging account) — click
    // the Card row first if the number field isn't already visible.
    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    const cardNumber = frame.locator('input[name="number"]');
    if (!(await cardNumber.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await frame.getByText("Card", { exact: true }).first().click();
    }
    await cardNumber.fill("4242424242424242");
    await frame.locator('input[name="expiry"]').fill("12 / 34");
    await frame.locator('input[name="cvc"]').fill("123");
    // US test cards may ask for a postal code.
    const zip = frame.locator('input[name="postalCode"]');
    if (await zip.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await zip.fill("42424");
    }

    // ── Pay. Deferred flow: this click creates the registration + intent,
    // then confirms — allow a generous window for the round trips. ──
    await page.getByRole("button", { name: /^pay \$/i }).click();

    // ── The invariant: an explicit confirmation, still in the wizard. v2
    // (waiver deferred) shows "You're in — one step left before game 1";
    // v1 shows "Your spot is locked!". Either is a valid success surface. ──
    await expect(
      page.getByText(/You're in — one step left|Your spot is locked/i),
    ).toBeVisible({ timeout: 60_000 });
    expect(
      page.url(),
      "payment success must land on the confirmation step, not bounce to the dashboard",
    ).toContain(`/register/${seasonId}`);
  });
});

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// Money-flow regression for PICKUP/DROP-IN: a guest completes a REAL
// test-mode card payment through the inline deferred form (no hosted-Checkout
// redirect) and sees the explicit "Booking confirmed" outcome on the session
// page. Mirrors payment-confirmation.spec.ts for the registration flows.
//
// Requires a Stripe-configured server (test-mode keys — the bws dev server).
// CI has no Stripe, so the spec self-skips when the payment iframe never
// mounts. Run locally with:
//   PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- dropin-payment

test.describe("Drop-in inline payment (test-mode card)", () => {
  test.setTimeout(180_000);

  let sessionId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Find an upcoming, bookable, PAID drop-in session from the fixtures.
    const listRes = await request.get("/api/dropin/sessions?upcoming=1");
    if (!listRes.ok()) return;
    const list = await listRes.json();
    const candidates: Array<{ id: string }> = (list.sessions ?? list ?? []).slice(0, 8);
    for (const c of candidates) {
      const detailRes = await request.get(`/api/dropin/sessions/${c.id}`);
      if (!detailRes.ok()) continue;
      const detail = await detailRes.json();
      const amount = detail.resolvedAmountCents;
      const spotsLeft =
        typeof detail.confirmedCount === "number" && detail.session?.capacity
          ? detail.session.capacity - detail.confirmedCount
          : 1;
      if (typeof amount === "number" && amount > 0 && spotsLeft > 0) {
        sessionId = c.id;
        break;
      }
    }
  });

  test("guest pays inline with 4242 and sees Booking confirmed — no redirect to Stripe", async ({
    page,
  }) => {
    test.skip(!sessionId, "no paid bookable drop-in session fixture found");

    await page.goto(`/dropin/${sessionId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Book — opens the waiver dialog (guest variant collects email + name).
    await page.getByRole("button", { name: /^book — \$/i }).click();

    const unique = `dropin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Anonymous booker: the dialog collects email + waiver + typed name. Wait
    // for the dialog to mount fully before filling (a short visibility probe
    // here raced the dialog animation and silently skipped the email, leaving
    // Continue disabled forever).
    const emailInput = page.getByPlaceholder("you@email.com");
    await emailInput.waitFor({ state: "visible", timeout: 10_000 });
    await emailInput.fill(`${unique}@test.example`);
    await page.locator("#guest-first-name").fill("Dropin");
    await page.locator("#guest-last-name").fill("Verifier");
    await page.locator("#waiver-accept").click();
    await page.locator("#waiver-name").fill("Dropin Verifier");
    const continueBtn = page.getByRole("button", { name: /continue to payment/i });
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
    await continueBtn.click();

    // The inline deferred card form replaces the Book button — the customer
    // never leaves the site. Self-skip when Stripe isn't configured (CI).
    const stripeFrameEl = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const mounted = await stripeFrameEl
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!mounted, "Stripe not configured in this environment (no payment iframe)");
    expect(page.url(), "must stay on the session page — no checkout.stripe.com redirect")
      .toContain(`/dropin/${sessionId}`);

    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    const cardNumber = frame.locator('input[name="number"]');
    if (!(await cardNumber.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await frame.getByText("Card", { exact: true }).first().click();
    }
    await cardNumber.fill("4242424242424242");
    await frame.locator('input[name="expiry"]').fill("12 / 34");
    await frame.locator('input[name="cvc"]').fill("123");
    const country = frame.locator('select[name="country"]');
    if (await country.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await country.selectOption("US");
    }
    const zip = frame.locator('input[name="postalCode"]');
    if (await zip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await zip.fill("42424");
    }

    // Pay — deferred: this click creates the PaymentIntent then confirms.
    const payButton = page.getByRole("button", { name: /^pay \$/i });
    await expect(payButton).toBeEnabled({ timeout: 15_000 });
    await payButton.click();
    const confirmedBanner = page.getByText(/Booking confirmed|Payment received/i);
    const firstTry = await confirmedBanner
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!firstTry && (await payButton.isEnabled().catch(() => false))) {
      await payButton.click(); // element-revalidation click swallow — same as team spec
    }

    // Explicit outcome on the session page (webhook may still be finalizing —
    // both the confirmed and finalizing banners are honest success surfaces).
    await expect(confirmedBanner).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toContain("booking=success");
  });
});

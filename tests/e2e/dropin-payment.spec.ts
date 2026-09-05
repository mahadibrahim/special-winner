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

  test("guest pays inline with 4242, sees Booking confirmed, then signs the waiver post-pay", async ({
    page,
  }) => {
    test.skip(!sessionId, "no paid bookable drop-in session fixture found");

    await page.goto(`/dropin/${sessionId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Book — opens the minimal guest details dialog (email + name ONLY; the
    // waiver moved AFTER payment — "sign before you PLAY, not before you pay").
    await page.getByRole("button", { name: /^book — \$/i }).click();

    const unique = `dropin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Wait for the dialog to mount fully before filling (a short visibility
    // probe here raced the dialog animation and silently skipped the email,
    // leaving Continue disabled forever).
    const emailInput = page.getByPlaceholder("you@email.com");
    await emailInput.waitFor({ state: "visible", timeout: 10_000 });
    await emailInput.fill(`${unique}@test.example`);
    await page.locator("#guest-first-name").fill("Dropin");
    await page.locator("#guest-last-name").fill("Verifier");
    // No waiver checkbox/signature pre-pay — the dialog is contact-only.
    await expect(page.locator("#waiver-accept")).toHaveCount(0);
    // The dialog CTA doubles as environment detection. With a publishable key
    // the paid session renders "Continue to payment" (inline deferred form);
    // without one (CI's STRIPE_* secrets are empty) BookButton's `paidInline`
    // is false and even a paid session falls back to the legacy submit,
    // labelled "Confirm & book". The old assertion demanded "Continue to
    // payment" outright, which turned a Stripe-less environment into a hard
    // failure the moment the shared staging DB offered ANY paid bookable
    // session in the first 8 upcoming (#620's class fixtures did exactly
    // that) — the iframe self-skip below sits past that assertion and could
    // never fire. Detect the fallback here and skip instead.
    const submitBtn = page.getByRole("button", {
      name: /continue to payment|confirm & book/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    const submitLabel = ((await submitBtn.textContent()) ?? "").trim();
    test.skip(
      /confirm & book/i.test(submitLabel),
      "Stripe not configured in this environment (paid session fell back to the legacy submit path)",
    );
    await submitBtn.click();

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

    // Post-payment waiver capture — the confirmed surface shows the
    // sign-the-waiver card once the webhook-inserted booking resolves
    // (the page polls; the card can trail the banner by a beat).
    const waiverAccept = page.locator("#waiver-accept");
    await waiverAccept.waitFor({ state: "visible", timeout: 60_000 });
    await waiverAccept.click();
    await page.locator("#waiver-name").fill("Dropin Verifier");
    const signBtn = page.getByRole("button", { name: /^sign waiver$/i });
    await expect(signBtn).toBeEnabled({ timeout: 10_000 });
    await signBtn.click();

    // Signed confirmation state replaces the card.
    await expect(page.locator("[data-waiver-signed]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Waiver signed/i)).toBeVisible();
  });
});

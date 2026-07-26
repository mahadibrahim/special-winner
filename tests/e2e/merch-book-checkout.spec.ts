import { test, expect } from "@playwright/test";
import { E2E_MERCH_BOOK_STORE_SLUG } from "@/lib/db/seeds/seed-e2e-tests";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Lulu book storefront flow (merch Lulu phase). Requires the dev server to
 * run with LULU_MOCK=1 (mock levels: MAIL $3.99 … EXPRESS $24.99).
 * Stops before Stripe — payment + fulfillment are covered by API tests.
 * NOTE: runs post-merge only (test-full); run locally before merging.
 */
test.describe("Merch book checkout", () => {
  test("add book → address → live level picker reprices shipping", async ({ page }) => {
    await page.goto(`/shop/${E2E_MERCH_BOOK_STORE_SLUG}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Store grid links straight to the product-detail page (src/pages/shop/[slug].astro) —
    // no add-to-cart button on the grid itself.
    await page.getByRole("heading", { name: "E2E Print Guide" }).click();
    await waitForHydration(page);

    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/shop/checkout", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Scope to <main>'s <form> — the page footer has its own newsletter-signup
    // form with an "Email address" field, and getByLabel's substring matching
    // would otherwise collide with several of the checkout field labels below.
    const form = page.locator("main form");
    await form.getByLabel("Email", { exact: true }).fill("book-buyer@test.aspiresports.com");
    await form.getByLabel("Full name").fill("Book Buyer");
    await form.getByLabel("Address", { exact: true }).fill("123 Test St");
    await form.getByLabel("City").fill("Columbus");
    await form.getByLabel("State").fill("OH");
    await form.getByLabel("ZIP code").fill("43085");
    await form.getByRole("button", { name: /get shipping total/i }).click();

    const picker = form.getByRole("radiogroup", { name: "Shipping speed" });
    await expect(picker).toBeVisible();
    await expect(picker.getByText("Mail", { exact: true })).toBeVisible();

    // Assert the *totals block*'s shipping/total rows specifically, not the
    // static per-option price labels inside the picker (every option's price
    // — including "Express … $24.99" — is in the DOM as soon as the picker
    // renders, regardless of which radio is selected; asserting against
    // `form.getByText(...)` without this scope would pass even if the
    // reprice never actually fired). The rows carry a data-testid for this.
    const shippingTotal = form.getByTestId("checkout-shipping-total");
    const orderTotal = form.getByTestId("checkout-order-total");
    await expect(shippingTotal).toHaveText("$3.99"); // default = cheapest (MAIL)
    await expect(orderTotal).toHaveText("$18.99"); // $15.00 subtotal + $3.99 shipping

    await picker.getByText("Express", { exact: true }).click();
    await expect(shippingTotal).toHaveText("$24.99"); // repriced shipping row
    await expect(orderTotal).toHaveText("$39.99"); // $15.00 subtotal + $24.99 shipping
  });
});

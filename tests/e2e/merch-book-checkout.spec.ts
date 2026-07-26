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
    await expect(form.getByText("$3.99").first()).toBeVisible(); // default = cheapest

    await picker.getByText("Express", { exact: true }).click();
    await expect(form.getByText("$24.99").first()).toBeVisible(); // repriced total row
  });
});

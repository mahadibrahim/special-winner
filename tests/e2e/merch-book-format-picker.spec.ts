import { test, expect } from "@playwright/test";
import { E2E_MERCH_BOOK_STORE_SLUG } from "@/lib/db/seeds/seed-e2e-tests";
import { waitForHydration } from "../utils/test-helpers";

/**
 * "One book listing, two formats" (merch Lulu phase, Task 12) — the
 * storefront format picker on a lulu_pod product with a linked digital
 * companion. Fixture: seedMerchBookFixture in seed-e2e-tests.ts seeds
 * "E2E Print Guide" (lulu_pod, $15.00) paired via digitalCompanionId with
 * "E2E Print Guide (Digital)" (digital, $9.00) in the same book store.
 */
test.describe("Merch book format picker", () => {
  test("store grid does not list the digital companion as its own card", async ({ page }) => {
    await page.goto(`/shop/${E2E_MERCH_BOOK_STORE_SLUG}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByRole("heading", { name: "E2E Print Guide", exact: true })).toBeVisible();
    // The companion is a format of the print book, not its own listing —
    // its distinct name must never appear as a grid card.
    await expect(page.getByRole("heading", { name: "E2E Print Guide (Digital)" })).toHaveCount(0);
  });

  test("picker defaults to Paperback; switching to Digital PDF adds the companion to the cart", async ({ page }) => {
    await page.goto(`/shop/${E2E_MERCH_BOOK_STORE_SLUG}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByRole("heading", { name: "E2E Print Guide", exact: true }).click();
    await waitForHydration(page);

    // Format picker is a fieldset/legend "Format" with two aria-pressed
    // buttons — the same idiom the "Options" (size/color) picker above it
    // uses, so a plain <fieldset> (implicit role "group") is the right target.
    const format = page.getByRole("group", { name: "Format" });
    await expect(format).toBeVisible();
    const paperback = format.getByRole("button", { name: "Paperback — $15.00" });
    const digital = format.getByRole("button", { name: "Digital PDF — $9.00" });
    await expect(paperback).toBeVisible();
    await expect(digital).toBeVisible();

    // Paperback preselected.
    await expect(paperback).toHaveAttribute("aria-pressed", "true");
    await expect(digital).toHaveAttribute("aria-pressed", "false");

    await digital.click();
    await expect(digital).toHaveAttribute("aria-pressed", "true");
    await expect(paperback).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: /add to cart/i }).click();

    // Open the cart drawer and assert the DIGITAL product's name/price landed
    // in the cart, not the print product's.
    await page.getByRole("button", { name: /^cart/i }).click();
    const drawer = page.getByRole("dialog", { name: "Cart" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("E2E Print Guide (Digital)", { exact: true })).toBeVisible();
    await expect(drawer.getByText("$9.00 × 1")).toBeVisible();
    // The print product's own line must not also be present.
    await expect(drawer.getByText("E2E Print Guide", { exact: true })).toHaveCount(0);
  });
});

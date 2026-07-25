import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

test("a guest (no account) can request a field and see the request confirmed", async ({
  page,
}) => {
  // No signIn() call — this proves the headline win: a signed-out visitor
  // can submit a rental request with no account.
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Pick the seeded rental-enabled venue. If the select has only one option
  // (the seeded "E2E Rental Field Complex") it's already selected. Explicitly
  // select index 0 to ensure the availability fetch fires.
  const venueSelect = page.getByLabel(/^venue$/i);
  await venueSelect.selectOption({ index: 0 });

  // Pick a far-future date the seed leaves free. 2035-08-15 is a Wednesday
  // well outside any season window — no collisions with API-test bookings.
  const dateInput = page.getByLabel(/^date$/i);
  await dateInput.fill("2035-08-15");

  // Wait for at least one hourly slot button to appear (availability loaded).
  await page.waitForSelector("button:has-text('AM'), button:has-text('PM')", {
    timeout: 15_000,
  });

  // Click the first available slot button.
  await page.locator("button").filter({ hasText: /AM|PM/ }).first().click();

  // Wait for the booking form to appear (it renders only after a slot is selected).
  await page.waitForSelector("#party-size", { timeout: 5_000 });

  // Fill party size (clear the default first).
  const partySizeInput = page.getByLabel(/party size/i);
  await partySizeInput.clear();
  await partySizeInput.fill("8");

  // Guest contact fields (only rendered when signed out): fill name + email.
  await page.getByLabel(/your full legal name/i).fill("Test Guest");
  await page.getByLabel(/^email$/i).fill("guest-rental@e2e.aspiresports.test");

  // Check the waiver acceptance checkbox (wrapped in a <label> with text "I accept").
  await page.getByLabel(/I accept/i).check();

  // Submit — button text is "Request this slot".
  await page.getByRole("button", { name: /request this slot/i }).click();

  // POST /api/rentals/bookings now always returns { requested: true } (no
  // Stripe interaction) — the island swaps the form for a "Request
  // submitted" confirmation panel in place, with no navigation away from
  // /rentals.
  await expect(
    page.getByRole("heading", { name: "Request submitted" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(/we've got your request for this slot/i),
  ).toBeVisible();

  expect(page.url()).toContain("/rentals");
});

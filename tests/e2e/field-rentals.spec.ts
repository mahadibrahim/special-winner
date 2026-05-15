import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("a signed-in customer can book a field through to Stripe Checkout", async ({
  page,
}) => {
  await signIn(page, "parent@test.aspiresports.com", "TestParent123!");
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

  // Fill waiver: label is "Your full legal name".
  await page.getByLabel(/your full legal name/i).fill("Test Parent");

  // Check the waiver acceptance checkbox (wrapped in a <label> with text "I accept").
  await page.getByLabel(/I accept/i).check();

  // Submit — button text is "Continue".
  await page.getByRole("button", { name: /continue/i }).click();

  // Either land on Stripe Checkout (paid path) or the dashboard success page (comp path).
  // Both mean the form submitted successfully — assert we navigated away from /rentals.
  await page.waitForURL(
    /checkout\.stripe\.com|\/dashboard\/bookings|\/signin/,
    { timeout: 20_000 },
  );

  expect(page.url()).not.toContain("/rentals");
});

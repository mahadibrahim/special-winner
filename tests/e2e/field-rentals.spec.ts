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

  // Two valid outcomes from the booking POST:
  //   1) success → redirect to Stripe Checkout (paid path) or the dashboard
  //      success page (comp / $0 path);
  //   2) the dev server doesn't have Stripe keys → 500 with "Stripe not
  //      configured", which the island renders in an <ErrorBanner>.
  // (2) happens on CI test-full shards that don't pass Stripe secrets to the
  // dev server. Skip in that case rather than time out and fail — same
  // pattern bookings.test.ts uses for the API-level paid-path test.
  const navigated = page
    .waitForURL(/checkout\.stripe\.com|\/dashboard\/bookings|\/signin/, {
      timeout: 20_000,
    })
    .then(() => "navigated" as const)
    .catch(() => "timeout" as const);
  const stripeMissing = page
    // .first(): the island fires BOTH toast.error and the ErrorBanner for
    // 5xx, so this text matches twice now that BaseLayout mounts a Toaster —
    // a bare (strict) locator rejects instantly on the double match.
    .getByText(/Stripe not configured/i)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => "no-stripe" as const)
    .catch(() => "no-banner" as const);
  const outcome = await Promise.race([navigated, stripeMissing]);

  if (outcome === "no-stripe") {
    test.skip(
      true,
      "Stripe not configured in dev-server env — paid booking path cannot be verified end-to-end",
    );
    return;
  }
  if (outcome !== "navigated") {
    throw new Error(
      `Booking submit produced neither a redirect nor a 'Stripe not configured' banner within 20s. URL: ${page.url()}`,
    );
  }

  expect(page.url()).not.toContain("/rentals");
});

import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

/**
 * Smoke E2E for the admin check-in dashboard.
 *
 * Verifies:
 *   - Admin can access /admin/check-in (auth gate works)
 *   - CheckInDashboard hydrates (useHydrationBeacon fires)
 *   - Heading and venue/date selectors render
 *   - The seed venue ("E2E Rental Field Complex") appears in the venue picker
 *
 * Walk-in-with-Stripe E2E is deferred: the walkin endpoints have 11/11 API
 * tests covering the payment flow; a browser-level E2E can land in a follow-up
 * once the Stripe test-mode key is plumbed into the E2E environment.
 */
test("admin can open the check-in dashboard for the seed venue", async ({
  page,
}) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/check-in", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Heading rendered by CheckInDashboard
  await expect(
    page.getByRole("heading", { name: /today.s check-in/i })
  ).toBeVisible();

  // Venue select — the <label> wraps a <span>Venue</span> + <select>.
  // Playwright getByLabel looks for aria-label or for= attributes; the
  // implicit-label-wrapping-span pattern requires a CSS/text approach instead.
  const venueSelect = page.locator("label").filter({ hasText: /^Venue/ }).locator("select");
  await expect(venueSelect).toBeVisible();

  // Date input — same label pattern
  const dateInput = page.locator("label").filter({ hasText: /^Date/ }).locator("input[type='date']");
  await expect(dateInput).toBeVisible();

  // Seed venue should be an option in the select
  const venueOptions = await venueSelect.locator("option").allTextContents();
  const hasSeedVenue = venueOptions.some((text) =>
    /E2E Rental Field Complex/i.test(text)
  );
  expect(
    hasSeedVenue,
    `Expected "E2E Rental Field Complex" in venue options but got: ${venueOptions.join(", ")}`
  ).toBe(true);
});

/**
 * Extended smoke: after selecting the seed venue and today's date, the
 * dashboard fires the day-view API call and renders either an EmptyState
 * ("Nothing scheduled") or a list of event cards — never an error banner.
 *
 * This does NOT require seeded events for today; the EmptyState path is
 * acceptable and exercised on every fresh CI run.
 */
test("check-in dashboard fetches day view without error for the seed venue", async ({
  page,
}) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/check-in", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Select the seed venue explicitly (same implicit-label selector as above)
  const venueSelect = page.locator("label").filter({ hasText: /^Venue/ }).locator("select");
  await venueSelect.selectOption({ label: "E2E Rental Field Complex" });

  // Wait for the day-view fetch to complete. Two acceptable outcomes:
  //   1. EmptyState: "Nothing scheduled" (no events today — expected on CI)
  //   2. At least one EventCard visible (if today has seeded events)
  //
  // The loading skeleton is visible briefly then replaced by one of the above.
  // Use a generous timeout since Railway DB can be slow under parallel CI load.
  // EventCards render as <button> elements inside the events list
  const emptyState = page.getByText(/nothing scheduled/i);
  const firstEventCard = page.locator("button").filter({ hasText: /booked/i }).first();

  await Promise.race([
    emptyState.waitFor({ state: "visible", timeout: 20_000 }),
    firstEventCard.waitFor({ state: "visible", timeout: 20_000 }),
  ]);

  // Confirm no error banner appeared
  const errorBanner = page.locator("[role='alert']").filter({
    hasText: /failed|error|unauthorized/i,
  });
  await expect(errorBanner).not.toBeVisible();
});

import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

/**
 * Covers the /admin/dropins "Sessions" tab week view (Task 1-3 of the
 * pickup-hosts-redesign spec): 7 day-group sections (or the whole-week
 * EmptyState when nothing is scheduled), and the ◀ / ▶ / Today week
 * navigation controls.
 *
 * Deliberately does NOT assert on which sessions exist — the e2e seed's
 * drop-in fixtures may or may not fall inside the current calendar week,
 * so the seed can drift without breaking this spec.
 */
test.describe("Admin pickup week view", () => {
  test("shows day groups or empty state, and navigates weeks", async ({ page }) => {
    await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
    await page.goto("/admin/dropins");
    await waitForHydration(page);

    const dayGroups = page.getByTestId("day-group");
    const emptyState = page.getByText("No sessions in this view");

    // Either the week has sessions (7 day-group sections, one per day) or it
    // doesn't (the whole-week EmptyState) — never both, never neither.
    await expect(dayGroups.first().or(emptyState)).toBeVisible();
    const dayGroupCount = await dayGroups.count();
    if (dayGroupCount > 0) {
      await expect(dayGroups).toHaveCount(7);
      await expect(emptyState).toHaveCount(0);
    } else {
      await expect(emptyState).toBeVisible();
    }

    // The week-range label ("Jul 20 – 26", cross-month/year aware) is the
    // first en-dash text on the page — it renders above the day list, and
    // ahead of any session cards' time-range text (which also uses an en
    // dash, e.g. "10:00 AM – 11:00 AM").
    const weekLabel = page.locator("text=/–/").first();
    const initialLabel = (await weekLabel.textContent())?.trim();
    expect(initialLabel).toBeTruthy();

    await page.getByRole("button", { name: "▶", exact: true }).click();

    // The label recomputes synchronously off the new week anchor (it
    // doesn't wait on the sessions fetch), so it changes immediately.
    await expect(page.getByText(initialLabel!, { exact: true })).toHaveCount(0);
    const nextLabel = (await page.locator("text=/–/").first().textContent())?.trim();
    expect(nextLabel).toBeTruthy();
    expect(nextLabel).not.toBe(initialLabel);

    // Today returns to the original week.
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText(initialLabel!, { exact: true }).first()).toBeVisible();
  });
});

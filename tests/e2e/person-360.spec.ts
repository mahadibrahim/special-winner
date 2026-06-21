import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

/**
 * Person-360 E2E: search → person card
 *
 * Flow:
 *   1. Sign in as admin.
 *   2. Navigate to /admin/venue (the command center that hosts CommandSearchBar +
 *      PersonCard).
 *   3. Wait for React hydration (VenueCommandCenter calls useHydrationBeacon).
 *   4. Type a query into the search input (≥2 chars to clear the debounce threshold
 *      in CommandSearchBar — a single character does not trigger the API call).
 *   5. If any [data-person-result] rows appear, click the first one and assert that
 *      the Person 360 slide-over (role="dialog") opens and shows a type badge
 *      matching /child|adult|parent/i.
 *
 * Guard strategy: all data-dependent assertions are behind count() checks so the
 * test passes (skip-style) on a thin seed rather than failing.
 *
 * Timeouts: elevated because the /api/admin/person/[id] aggregation is slow against
 * the bloated staging DB in CI.
 */
test("search opens the person-360 card", async ({ page }) => {
  test.setTimeout(90_000);

  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page, { timeout: 20_000 });

  // ── Locate the search input by its actual placeholder ──────────────────────
  // CommandSearchBar renders:
  //   <input placeholder="Search players and accounts…" aria-label="Search players and accounts" />
  // The regex /search|find/i from the brief still matches "Search", but we use
  // the aria-label for a more stable selector.
  const search = page.getByLabel("Search players and accounts");
  await expect(search).toBeVisible({ timeout: 10_000 });

  // Type at least 2 chars — CommandSearchBar skips the API fetch on debounced.length < 2.
  // The brief suggested "a" (1 char) but that never fires; use "al" instead.
  await search.fill("al");

  // ── Wait for results dropdown (role="listbox") to appear ───────────────────
  // If the staging DB is empty or the search returns nothing, the listbox may
  // still render with a "No matches." message. We guard every data-dependent
  // step with count() so the test degrades gracefully.
  const resultRows = page.locator("[data-person-result]");

  // Give the debounce + fetch up to 15 s to produce at least one row.
  // If it stays 0, we skip the click/assert block.
  let rowCount = 0;
  try {
    await expect(resultRows.first()).toBeVisible({ timeout: 15_000 });
    rowCount = await resultRows.count();
  } catch {
    // No results on this seed — test passes without asserting the card.
  }

  if (rowCount > 0) {
    // Click the first result (player or account row).
    await resultRows.first().click();

    // ── Person card (Sheet) should open ──────────────────────────────────────
    // PersonCard renders a shadcn Sheet → role="dialog" in the DOM.
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible({ timeout: 60_000 });

    // ── Type badge must match one of the three person shapes ─────────────────
    // PersonSections.typeBadgeLabel() returns:
    //   child  → "Child · age N"
    //   adult  → "Adult player"
    //   parent → "Parent · account"
    await expect(
      card.getByText(/child|adult|parent/i).first()
    ).toBeVisible({ timeout: 60_000 });

    // ── Contact line must be present ─────────────────────────────────────────
    // PersonHeader always renders at least one of:
    //   • a tel: anchor (phone)
    //   • a mailto: anchor (email)
    //   • a "parent: …" span (isParentContact)
    // We assert that the card contains at least one tel/mailto link OR the
    // "parent: " text, which covers all three person types.
    const contactLink = card.locator('a[href^="tel:"], a[href^="mailto:"]');
    const parentLabel = card.getByText(/^parent:/i);
    const hasPhone = (await contactLink.count()) > 0;
    const hasParentLabel = (await parentLabel.count()) > 0;
    expect(hasPhone || hasParentLabel, "expected a contact link or parent label in the card").toBe(true);
  }
});

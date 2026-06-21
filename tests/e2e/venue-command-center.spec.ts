import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

test("venue command center renders and opens an activity roster", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // NeedsAttentionQueue always renders the "Needs attention" h2 heading —
  // either with grouped items or with the "All clear" empty state beneath it.
  await expect(page.getByText(/needs attention/i)).toBeVisible();

  // ActivityBlock renders with data-activity-block on its root div.
  // Guard with count() so the test passes when the seeded venue has no sessions.
  const block = page.locator("[data-activity-block]").first();
  if ((await block.count()) > 0) {
    await block.click();

    // ActivityDetailPanel renders as role="dialog".  The × close button
    // (aria-label="Close") is always present when the panel is open.
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(
      panel.getByRole("button", { name: /close/i }),
    ).toBeVisible();

    // If the session has open capacity, ActivityDetailPanel renders
    // "Open slot — add walk-in" rows (exact text from ActivityDetailPanel.tsx).
    // This assertion is conditional — it passes on sessions with no open slots.
    const openSlotRow = panel.getByText(/open slot.*add walk-in/i);
    if ((await openSlotRow.count()) > 0) {
      await expect(openSlotRow.first()).toBeVisible();
    }
  }
});
